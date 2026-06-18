// Travelpayouts affiliate link helpers.
//
// We earn commission only on clicks that carry our `marker` (the TP
// account ID). The marker lives in TRAVELPAYOUTS_MARKER and falls back
// to the literal 716767 so a missing env never silently drops attribution.
//
// Two surfaces:
//   - aviasalesUrl(): direct Aviasales search URL with marker — TP's
//     primary flight partner. This is the only flight link we currently
//     earn commission on; Skyscanner/Kayak/Expedia each need their own
//     separate affiliate programs.
//   - wrapTP(): generic redirector via tp.media/r for any other URL.
//     TP attributes if the destination matches a TP-partner domain
//     (Booking.com, Hotellook, etc.) and ignores it otherwise.

const MARKER = process.env.TRAVELPAYOUTS_MARKER ?? "716767";

function withMarker(marker: string, subId?: string): string {
  if (!subId) return marker;
  const safe = subId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return `${marker}.${safe}`;
}

// Direct Aviasales search URL. Aviasales accepts ISO dates as
// `depart_date` / `return_date` and IATA codes as `origin_iata` /
// `destination_iata`. This is the canonical TP-attributed flight link.
export function aviasalesUrl(
  fromIata: string,
  toIata: string,
  isoStart?: string | null,
  isoEnd?: string | null,
  subId?: string,
): string {
  const params = new URLSearchParams({
    origin_iata: fromIata.toUpperCase(),
    destination_iata: toIata.toUpperCase(),
    adults: "1",
    marker: withMarker(MARKER, subId),
  });
  if (isoStart) params.set("depart_date", isoStart);
  if (isoEnd) params.set("return_date", isoEnd);
  return `https://www.aviasales.com/search?${params.toString()}`;
}

// Wrap any URL through tp.media/r so TP can attribute if the
// destination is a partner domain. No-op for non-partner destinations
// but harmless — the redirector still forwards.
export function wrapTP(rawUrl: string, subId?: string): string {
  if (!rawUrl) return rawUrl;
  const marker = withMarker(MARKER, subId);
  const params = new URLSearchParams({
    marker,
    u: rawUrl,
  });
  if (subId) params.set("trs", subId);
  return `https://tp.media/r?${params.toString()}`;
}

export const TP_MARKER = MARKER;
