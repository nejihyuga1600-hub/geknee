// POST /api/share/analyze-media
//
// Vision-based venue extraction from a shared image OR video first-frame.
// Called by the iOS Share Extension, Android share intent handler, and the
// PWA Web Share Target (/api/share/receive) when the shared payload is a
// media blob rather than a URL.
//
// Body: multipart/form-data
//   file:      Blob (image/jpeg | image/png | image/webp | image/gif)
//   caption?:  string (e.g. IG caption forwarded from the share extension)
//   sourceUrl?:string (original post URL if we have it)
//
// Response: same shape as /api/share-unfurl so downstream picker UI can
// stay generic between "URL share" and "media share" flows.

import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACES_KEY =
  process.env.GOOGLE_PLACES_API_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type VisionResult = {
  venueName: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  thumbnail?: string;
  source: "vision";
  sourceUrl?: string;
  confidence: "high" | "medium" | "low";
  ocr_text?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return Response.json(
      { error: "multipart/form-data required" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "file field required" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `file exceeds ${MAX_BYTES} bytes; downsize client-side` },
      { status: 413 }
    );
  }

  const contentType = (file.type || "image/jpeg").toLowerCase();
  if (!ACCEPTED_TYPES.has(contentType)) {
    return Response.json(
      {
        error:
          "unsupported media type; extract a JPEG/PNG/WebP frame client-side for videos",
      },
      { status: 415 }
    );
  }

  const caption = (form.get("caption") as string | null)?.trim() ?? "";
  const sourceUrl = (form.get("sourceUrl") as string | null)?.trim() ?? "";

  const buf = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(buf).toString("base64");

  const anthropic = new Anthropic();
  const result = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: contentType as
                | "image/jpeg"
                | "image/png"
                | "image/webp"
                | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: buildTextPrompt(caption, sourceUrl) },
        ],
      },
    ],
  });

  const raw =
    result.content[0]?.type === "text" ? result.content[0].text : "";
  const parsed = parseVisionResponse(raw);

  // If Claude named a venue but we have no coords, hit Google Places
  // text-search to fill in lat/lon + normalize city/country.
  if (parsed.venueName && (parsed.lat == null || parsed.lon == null)) {
    const q = [parsed.venueName, parsed.city, parsed.country]
      .filter((v): v is string => Boolean(v))
      .join(", ");
    const enrich = await placesLookup(q);
    if (enrich) {
      parsed.lat = enrich.lat;
      parsed.lon = enrich.lon;
      parsed.city = parsed.city ?? enrich.city;
      parsed.country = parsed.country ?? enrich.country;
    }
  }

  const response: VisionResult = {
    ...parsed,
    source: "vision",
    ...(sourceUrl ? { sourceUrl } : {}),
  };
  return Response.json(response);
}

const SYSTEM_PROMPT = `You are a travel-content analyst. Given a photo or video-frame that a user just shared into a travel-itinerary app, identify the specific physical VENUE (landmark, hotel, restaurant, viewpoint, neighborhood) shown.

Return STRICT JSON only, no prose, matching:
{
  "venueName": "<the specific venue e.g. 'The Colosseum', 'Koko Ramen Shibuya', 'Mount Fitz Roy Base Camp'. Empty string if ambiguous.>",
  "city": "<city if identifiable, else empty>",
  "country": "<country if identifiable, else empty>",
  "confidence": "<high | medium | low>",
  "ocr_text": "<any text overlay burned into the image (hook, place labels, prices) — max 200 chars>"
}

Rules:
- Prefer specific proper nouns over generic descriptions ("Trevi Fountain" not "a fountain in Rome").
- OCR text overlays are the strongest signal — treat creator captions burned into the image as ground truth.
- If you cannot identify a specific venue, return "" for venueName and describe the setting concisely in ocr_text.
- Do NOT invent details. Report low confidence rather than a wrong guess.`;

function buildTextPrompt(caption: string, sourceUrl: string): string {
  const parts: string[] = [];
  if (caption) parts.push(`Author caption: ${caption}`);
  if (sourceUrl) parts.push(`Source URL: ${sourceUrl}`);
  parts.push("Identify the venue in the image.");
  return parts.join("\n");
}

function parseVisionResponse(
  text: string
): Omit<VisionResult, "source" | "sourceUrl"> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { venueName: "", confidence: "low" };
  try {
    const j = JSON.parse(match[0]) as {
      venueName?: string;
      city?: string;
      country?: string;
      confidence?: string;
      ocr_text?: string;
    };
    const name = (j.venueName ?? "").trim();
    const confidence =
      j.confidence === "high" || j.confidence === "medium"
        ? j.confidence
        : ("low" as const);
    return {
      venueName: name,
      city: j.city?.trim() || undefined,
      country: j.country?.trim() || undefined,
      confidence,
      ocr_text: j.ocr_text?.trim() || undefined,
    };
  } catch {
    return { venueName: "", confidence: "low" };
  }
}

async function placesLookup(
  query: string
): Promise<{ lat: number; lon: number; city?: string; country?: string } | null> {
  if (!PLACES_KEY || !query) return null;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${PLACES_KEY}`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as {
    results?: Array<{
      geometry?: { location?: { lat: number; lng: number } };
      formatted_address?: string;
    }>;
  };
  const hit = data.results?.[0];
  if (!hit?.geometry?.location) return null;
  const parts = (hit.formatted_address ?? "").split(",").map((s) => s.trim());
  const country = parts[parts.length - 1] || undefined;
  const city = parts.length >= 3 ? parts[parts.length - 3] : undefined;
  return {
    lat: hit.geometry.location.lat,
    lon: hit.geometry.location.lng,
    city,
    country,
  };
}
