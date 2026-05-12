// Photo/video → itinerary activity.
//
// User uploads a photo (or video frame still) attached to a specific day
// of their trip. Claude vision identifies the place/activity and proposes
// a single insertable item; we then call the existing /api/itinerary/adjust
// path internally so persistence stays single-sourced.
//
// Input shape (multipart/form-data):
//   - tripId: string
//   - day: number (1-indexed)
//   - file: image blob (jpeg/png/webp). Videos: extract first frame on the
//     client and submit that frame as a PNG — server-side video transcode
//     is out of scope for this surface.
//
// Output: { itinerary: string, addedActivity: { name, time, kind } }

import Anthropic from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface VisionExtract {
  /** Place name as recognized (e.g., "Louvre", "Trattoria da Enzo"). */
  placeName: string;
  /** Short reason this should join the day. */
  rationale: string;
  /** What kind of stop — feeds the existing adjust endpoint's `meta` field. */
  kind: "meal" | "sight" | "experience" | "coffee" | "shopping" | "activity";
  /** Suggested time in 24h "HH:MM", server chooses based on day's existing slots. */
  suggestedTime: string;
  /**
   * When the client requested "any day", the model picks which day this
   * stop fits into best. Required iff caller sent day=0. Otherwise the
   * server's specified day wins.
   */
  chosenDay?: number;
  /** Confidence 0..1. <0.55 → reject. */
  confidence: number;
}

const VISION_SYSTEM = `You are looking at a single photo a traveler just took (or a still frame from a video they shot).

Identify what's in the photo and propose ONE itinerary activity that the traveler likely wants to add to the trip. You may be given a specific Day N's schedule, or the entire itinerary (any-day mode). In any-day mode pick the day that fits best based on what's in the photo (cuisine matching neighborhood, sights matching morning vs evening light, etc.) and return chosenDay as 1-indexed integer.

Return ONLY a JSON object, no commentary, no fences:
{
  "placeName": "best-guess specific name of what's pictured (e.g. 'Louvre', 'Café de Flore'). If ambiguous, give the category ('boulangerie', 'rooftop bar').",
  "rationale": "1 sentence on why this should be added.",
  "kind": "meal | sight | experience | coffee | shopping | activity",
  "suggestedTime": "HH:MM in 24h, chosen so it doesn't overlap with the existing slots",
  "chosenDay": 1-indexed integer — ONLY include in any-day mode,
  "confidence": 0..1
}

If you can't tell what's in the photo or it doesn't suggest a travel activity, return confidence below 0.4.`;

// Re-use the existing Day-N extractor from the manual replan endpoint.
// We can't import it directly from /api/itinerary/replan (route files
// don't export cleanly), so we duplicate the small extractor here.
function extractDay(itinerary: string, day: number): string | null {
  const heading = new RegExp(`(^|\\n)(#+\\s*Day\\s*${day}(?:\\b|[\\s:]))`, 'i');
  const next = new RegExp(`(^|\\n)(#+\\s*Day\\s*${day + 1}(?:\\b|[\\s:]))`, 'i');
  const startMatch = itinerary.match(heading);
  if (!startMatch || startMatch.index === undefined) return null;
  const blockStart = startMatch.index + (startMatch[1] ? 1 : 0);
  const tail = itinerary.slice(blockStart);
  const endMatch = tail.match(next);
  const blockEnd = endMatch && endMatch.index !== undefined
    ? blockStart + endMatch.index + (endMatch[1] ? 1 : 0)
    : itinerary.length;
  return itinerary.slice(blockStart, blockEnd);
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return Response.json({ error: "Expected multipart/form-data" }, { status: 400 }); }

  const tripId = String(form.get("tripId") ?? "");
  // day === 0 (or missing) means "any day" — the vision model picks the
  // best slot from the full itinerary. Specific 1..N targets a single day.
  const day = Number(form.get("day") ?? 0);
  const file = form.get("file");
  if (!tripId || !(file instanceof File)) {
    return Response.json({ error: "tripId, file required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Image file required (videos: submit a frame)" }, { status: 400 });
  }

  // Load trip + day block.
  const trip = await prisma.tripDraft.findUnique({
    where: { id: tripId },
    select: { id: true, userId: true, location: true, itinerary: true },
  });
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!trip.itinerary) return Response.json({ error: "No itinerary to attach to" }, { status: 400 });

  // Day context for the vision prompt. Specific day → just that block.
  // Any-day → the entire itinerary so the model can pick the best slot.
  let dayBlock: string | null;
  if (day === 0) {
    dayBlock = trip.itinerary;
  } else {
    dayBlock = extractDay(trip.itinerary, day);
    if (!dayBlock) {
      return Response.json({ error: `Day ${day} not found in itinerary` }, { status: 400 });
    }
  }

  // Upload the photo to Blob — we keep the URL on record so the itinerary
  // edit can reference the image and the future Gallery view can re-display.
  let photoUrl: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const bytes = await file.arrayBuffer();
      const ext = file.type.split("/")[1]?.replace("+xml", "").slice(0, 4) ?? "bin";
      const uploaded = await put(
        `itinerary-media/${userId}/${tripId}/day-${day}-${Date.now()}.${ext}`,
        Buffer.from(bytes),
        {
          access: "public",
          contentType: file.type,
          addRandomSuffix: false,
          allowOverwrite: false,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        },
      );
      photoUrl = uploaded.url;
    } catch (err) {
      console.error("[itinerary/media] blob upload failed:", err);
      // Continue without blob URL — Claude can still read from base64
    }
  }

  // Base64 for the vision call. Claude accepts base64 image content blocks.
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  let visionRaw: string;
  try {
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: VISION_SYSTEM,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: day === 0
              ? `Trip destination: ${trip.location ?? "unknown"}\n\nAny-day mode — pick the best day. Full itinerary:\n${dayBlock.trim()}`
              : `Trip destination: ${trip.location ?? "unknown"}\n\nCurrent Day ${day} schedule:\n${dayBlock.trim()}`,
          },
        ],
      }],
    });
    visionRaw = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
  } catch (err) {
    console.error("[itinerary/media] vision error:", err);
    return Response.json({ error: "Vision analysis failed" }, { status: 502 });
  }

  const cleaned = visionRaw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let extracted: VisionExtract;
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) throw new Error("not object");
    extracted = parsed as VisionExtract;
  } catch {
    return Response.json({ error: "Could not parse the photo" }, { status: 502 });
  }

  if ((extracted.confidence ?? 0) < 0.55) {
    return Response.json({
      error: "Couldn't confidently identify the place from this photo. Try a clearer shot or add the stop manually.",
    }, { status: 422 });
  }

  // Reuse the existing /api/itinerary/adjust call internally. Same-server
  // fetch keeps a single source of truth on how itinerary mutation is
  // persisted, and we get the exact same "minimal markdown edit" behaviour.
  //
  // In any-day mode, the resolved day comes from Claude's chosenDay; in
  // specific-day mode, the caller's day wins. effectiveDay clamps to 1
  // so the meta string never reads "Day 0".
  const effectiveDay = day === 0 ? Math.max(1, extracted.chosenDay ?? 1) : day;
  const adjustBody = {
    tripId,
    kind: "activity" as const,
    name: extracted.placeName,
    district: trip.location ?? undefined,
    meta: `Day ${effectiveDay} · ${formatTimeForDisplay(extracted.suggestedTime)} · ${extracted.kind}${photoUrl ? ` · photo: ${photoUrl}` : ""}`,
  };

  // Internal fetch so we go through the same auth + persistence pipeline.
  // Cookie forwarding: NextAuth uses cookies; we pass them through verbatim.
  const origin = new URL(req.url).origin;
  const adjustRes = await fetch(`${origin}/api/itinerary/adjust`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Forward auth cookies so the inner call sees the same session.
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(adjustBody),
  });
  if (!adjustRes.ok) {
    const j = await adjustRes.json().catch(() => null);
    console.error("[itinerary/media] adjust failed:", j);
    return Response.json({ error: j?.error ?? "Adjust failed" }, { status: 502 });
  }
  const adjustJson = await adjustRes.json() as { itinerary: string };

  return Response.json({
    itinerary: adjustJson.itinerary,
    addedActivity: {
      name: extracted.placeName,
      time: extracted.suggestedTime,
      kind: extracted.kind,
    },
    photoUrl,
  });
}

function formatTimeForDisplay(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
