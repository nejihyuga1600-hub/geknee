// Hotelbeds voucher — HTML template + email delivery.
//
// Cert §4.1: voucher mandatory on every confirmed booking.
// Cert §4.2: hotel name + address mandatory; category + destination + phone recommended.
// Cert §4.3: holder name + at least one pax per room + child ages mandatory.
// Cert §4.4: Hotelbeds reference + check-in/out + room type + board + rate comments mandatory.
// Cert §4.5: "Payable through XXX, acting as agent..." text mandatory.

import type { ConfirmedBooking } from "@/lib/hotelbeds";
import { getHotelContent, getRateComment, type HotelContent, type RateComment } from "@/lib/hotelbeds-content";

export interface VoucherInput {
  booking: ConfirmedBooking;
  guestEmail: string; // email recipient
  agencyReference?: string; // our internal trip/booking ID
}

export interface RenderedVoucher {
  html: string;
  subject: string;
  to: string;
}

// Render a voucher to HTML + an email subject. The HTML is intended
// to be sent inline via lib/admin/email.ts or shown via /voucher/[id].
export async function renderVoucher(input: VoucherInput): Promise<RenderedVoucher> {
  const { booking } = input;

  // Look up hotel content (description, photos, full address, phone)
  // and rate comments in parallel. Both are cached at the edge.
  const rateCommentsIds = booking.rooms
    .map((r) => r.rateCommentsId)
    .filter((id): id is string => !!id);
  const [content, rateComments] = await Promise.all([
    getHotelContent(booking.hotel.code),
    Promise.all(rateCommentsIds.map((id) => getRateComment(id))),
  ]);

  const html = renderVoucherHtml(booking, content, rateComments.filter((rc): rc is RateComment => !!rc), input.agencyReference);
  return {
    html,
    subject: `Booking confirmation — ${booking.hotel.name} (${booking.reference})`,
    to: input.guestEmail,
  };
}

function renderVoucherHtml(
  b: ConfirmedBooking,
  content: HotelContent | null,
  rateComments: RateComment[],
  agencyReference: string | undefined,
): string {
  const heroImage = content?.images.find((i) => i.type === "GEN")?.path ?? content?.images[0]?.path;
  const fullAddress = formatAddress(b, content);
  const phone = content?.phones.find((p) => p.phoneType === "PHONEBOOKING")?.phoneNumber
    ?? content?.phones[0]?.phoneNumber;

  // Cert §4.5: payable-through text with placeholder substitution.
  // Standard wording per the cert doc.
  const payableThrough = `Payable through ${escapeHtml(b.supplier.name)}, acting as agent for the service operating company, details of which can be provided upon request. VAT: ${escapeHtml(b.supplier.vatNumber)} Reference: ${escapeHtml(b.reference)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Booking Confirmation — ${escapeHtml(b.hotel.name)}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #0a0a1f; max-width: 640px; margin: 0 auto; padding: 24px; background: #f8f8fb; }
  .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 8px; color: #555; text-transform: uppercase; letter-spacing: 0.08em; }
  .hero { width: 100%; height: 240px; object-fit: cover; border-radius: 12px; margin-bottom: 16px; }
  .ref { font-family: ui-monospace, Menlo, monospace; font-size: 14px; color: #444; background: #f0f0f4; padding: 6px 10px; border-radius: 6px; display: inline-block; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 0; font-size: 14px; vertical-align: top; }
  td:first-child { color: #666; width: 35%; }
  .rate-comments { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; margin: 12px 0; font-size: 13px; }
  .payable { font-size: 11px; color: #777; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; line-height: 1.5; }
</style>
</head>
<body>

${heroImage ? `<img class="hero" src="${escapeAttr(heroImage)}" alt="${escapeAttr(b.hotel.name)}">` : ""}

<div class="card">
  <h1>${escapeHtml(b.hotel.name)}</h1>
  <p>${content?.category?.name ?? b.hotel.categoryName ?? ""}</p>
  <p style="margin: 4px 0;"><span class="ref">Ref: ${escapeHtml(b.reference)}</span>
  ${agencyReference ? `&nbsp;<span class="ref">Trip: ${escapeHtml(agencyReference)}</span>` : ""}</p>
  <h2>Hotel</h2>
  <table>
    <tr><td>Address</td><td>${escapeHtml(fullAddress)}</td></tr>
    ${b.hotel.destinationName ? `<tr><td>Destination</td><td>${escapeHtml(b.hotel.destinationName)}</td></tr>` : ""}
    ${phone ? `<tr><td>Phone</td><td>${escapeHtml(phone)}</td></tr>` : ""}
  </table>
</div>

<div class="card">
  <h2>Booking</h2>
  <table>
    <tr><td>Check-in</td><td><strong>${escapeHtml(b.checkIn)}</strong></td></tr>
    <tr><td>Check-out</td><td><strong>${escapeHtml(b.checkOut)}</strong></td></tr>
    ${b.rooms.map((r) => `
      <tr><td>Room</td><td>${escapeHtml(r.name)}</td></tr>
      <tr><td>Board</td><td>${escapeHtml(r.boardName)}</td></tr>
    `).join("")}
  </table>
  ${rateComments.length > 0 ? `
    <div class="rate-comments">
      <strong>Important:</strong><br>
      ${rateComments.map((rc) => escapeHtml(rc.description)).join("<br><br>")}
    </div>
  ` : ""}
</div>

<div class="card">
  <h2>Guests</h2>
  <table>
    ${b.rooms.flatMap((r) => r.paxes).map((p, i) => `
      <tr><td>${p.type === "AD" ? "Adult" : "Child"} ${i + 1}${p.type === "CH" && p.age ? ` (age ${p.age})` : ""}</td>
      <td>${escapeHtml(p.name)} ${escapeHtml(p.surname)}</td></tr>
    `).join("")}
  </table>
</div>

<div class="payable">${payableThrough}</div>

</body>
</html>`;
}

function formatAddress(b: ConfirmedBooking, content: HotelContent | null): string {
  if (content?.address) {
    const a = content.address;
    return [a.street, a.city, a.postalCode, a.country].filter(Boolean).join(", ");
  }
  return b.hotel.address ?? "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
