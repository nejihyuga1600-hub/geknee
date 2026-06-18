// Travelpayouts conversion poller. Runs every 6 hours via Vercel cron
// (configured in vercel.json), pulls the latest statistics for the past
// 7 days, upserts each conversion into the Booking table.
//
// Why polling vs webhooks: Travelpayouts doesn't expose a user-
// configurable postback URL across most programs (Tiqets, Klook,
// Aviasales, Hotellook). Their model is to surface conversions via
// statistics API which we pull. This is the canonical pattern their
// SDKs use.
//
// Sub-id matching: outbound links inject sub_id="trip-<tripId>" so
// when a conversion comes back we can attribute revenue to the
// originating trip. When sub_id is missing/malformed we still record
// the Booking row with tripId=null for revenue accounting.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TP_API_BASE = "https://api.travelpayouts.com";

// Travelpayouts statistics row — defensive shape (their schema varies
// per endpoint version). We treat everything beyond the marker/sub_id
// as best-effort and log the raw payload.
interface TPRow {
  marker?: string;
  sub_id?: string;
  trip_id?: string; // sometimes returned as a separate field
  order_id?: string;
  conversion_id?: string;
  program_name?: string;
  partner?: string;
  brand?: string;
  type?: string; // sometimes booking type indicator
  status?: string; // pending | confirmed | rejected | cancelled
  amount?: number;
  payout?: number;
  currency?: string;
  click_at?: string;
  conversion_at?: string;
  date?: string;
  [key: string]: unknown;
}

interface TPResponse {
  data?: TPRow[];
  conversions?: TPRow[];
  rows?: TPRow[];
  // Some endpoints return a top-level array
}

function pickRows(d: unknown): TPRow[] {
  if (Array.isArray(d)) return d as TPRow[];
  const o = d as TPResponse;
  return o.data ?? o.conversions ?? o.rows ?? [];
}

function pickStatus(raw?: string): string {
  if (!raw) return "pending";
  const r = raw.toLowerCase();
  if (r.includes("cancel")) return "cancelled";
  if (r.includes("reject") || r.includes("decline")) return "rejected";
  if (r.includes("confirm") || r.includes("paid") || r.includes("approved")) return "confirmed";
  return "pending";
}

function parseTripIdFromSubId(sub: string | undefined): string | null {
  if (!sub) return null;
  // Expected format: "trip-<cuid>" — fall back to picking up just the
  // suffix if format drifts.
  const m = sub.match(/^trip-([A-Za-z0-9_-]+)$/);
  if (m) return m[1];
  return null;
}

function isAuthorized(req: Request): boolean {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET> header.
  // We also allow an authenticated user session for manual triggering
  // during testing (the user is the only one who can hit the route then).
  const header = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return !!process.env.CRON_SECRET && header === expected;
}

export async function GET(req: Request) {
  // Cron header check first; allow auth fallback for manual hits.
  if (!isAuthorized(req)) {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) {
    return Response.json({ error: "TRAVELPAYOUTS_TOKEN not set" }, { status: 500 });
  }

  // Pull last 7 days. Each run overlaps the previous so we don't miss
  // conversions; the unique constraint on (partner, providerOrderId)
  // makes upserts idempotent.
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromYmd = since.toISOString().slice(0, 10);
  const toYmd = now.toISOString().slice(0, 10);

  const url = `${TP_API_BASE}/v2/statistics?token=${encodeURIComponent(token)}&from=${fromYmd}&to=${toYmd}&limit=1000`;

  let rows: TPRow[] = [];
  let rawSnippet = "";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Travelpayouts sometimes redirects to a login page when the
      // token is bad — refuse to follow that.
      redirect: "manual",
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[cron/travelpayouts-sync] Travelpayouts ${res.status}:`, text.slice(0, 400));
      return Response.json(
        { error: `Travelpayouts API ${res.status}`, detail: text.slice(0, 400) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as unknown;
    rows = pickRows(data);
    rawSnippet = JSON.stringify(data).slice(0, 200);
  } catch (err) {
    console.error("[cron/travelpayouts-sync] fetch failed:", err);
    return Response.json({ error: "Network error" }, { status: 502 });
  }

  if (rows.length === 0) {
    return Response.json({ ok: true, fetched: 0, upserted: 0, sample: rawSnippet });
  }

  let upserted = 0;
  let attributed = 0;
  for (const row of rows) {
    const providerOrderId =
      row.order_id ?? row.conversion_id ?? `${row.click_at ?? ""}-${row.amount ?? ""}-${row.sub_id ?? ""}`;
    if (!providerOrderId) continue;

    const tripId = parseTripIdFromSubId(row.sub_id ?? row.trip_id);
    if (tripId) attributed += 1;

    // Resolve userId via tripId when we have one (saves a join later).
    let userId: string | null = null;
    if (tripId) {
      const trip = await prisma.tripDraft.findUnique({
        where: { id: tripId },
        select: { userId: true },
      });
      userId = trip?.userId ?? null;
    }

    const status = pickStatus(row.status);
    const conversionAt = row.conversion_at
      ? new Date(row.conversion_at)
      : row.date
      ? new Date(row.date)
      : null;

    try {
      await prisma.booking.upsert({
        where: {
          partner_providerOrderId: { partner: "travelpayouts", providerOrderId },
        },
        create: {
          partner: "travelpayouts",
          partnerProgram: row.program_name ?? row.partner ?? row.brand ?? null,
          providerOrderId,
          tripId: tripId,
          userId,
          itemKind: typeof row.type === "string" ? row.type : null,
          itemName: typeof row.brand === "string" ? row.brand : null,
          amount: typeof row.amount === "number" ? new Prisma.Decimal(row.amount) : null,
          payout: typeof row.payout === "number" ? new Prisma.Decimal(row.payout) : null,
          currency: typeof row.currency === "string" ? row.currency : null,
          status,
          rawPayload: row as unknown as Prisma.InputJsonValue,
          conversionAt,
        },
        update: {
          // On overlap-window re-runs: status / amount can change as the
          // partner finalizes the conversion (pending → confirmed).
          status,
          amount: typeof row.amount === "number" ? new Prisma.Decimal(row.amount) : undefined,
          payout: typeof row.payout === "number" ? new Prisma.Decimal(row.payout) : undefined,
          rawPayload: row as unknown as Prisma.InputJsonValue,
          conversionAt: conversionAt ?? undefined,
        },
      });
      upserted += 1;
    } catch (err) {
      console.error("[cron/travelpayouts-sync] upsert failed for", providerOrderId, err);
    }
  }

  return Response.json({
    ok: true,
    fetched: rows.length,
    upserted,
    attributed, // how many had a parseable trip-<id> sub_id
    window: { from: fromYmd, to: toYmd },
  });
}
