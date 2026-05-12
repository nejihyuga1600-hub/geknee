// Gmail API client for the email-vault feature. Reads access tokens
// stored on the NextAuth Account row (provider='google'), refreshes
// them when expired, and exposes message-listing + fetch helpers.
//
// Auth path: when the user signs in via Google with the gmail.readonly
// scope (auth.ts), NextAuth's PrismaAdapter persists access_token,
// refresh_token, expires_at on the Account model. We read that row
// here, swap the refresh_token for a new access_token if needed, and
// write the new pair back.

import { prisma } from "@/lib/prisma";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  // refresh_token is only returned on the FIRST consent (with prompt=consent).
  refresh_token?: string;
}

// Refreshes a Google access token via the standard OAuth2 flow.
// Returns the new access_token + its absolute expiry (epoch seconds).
async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: number;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    console.error("[gmail-client] refresh failed:", resp.status, await resp.text());
    return null;
  }
  const data = (await resp.json()) as RefreshResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

// Returns a valid Google access token for the user, refreshing if
// expired. Returns null if the user has no Google connection or the
// refresh failed (e.g. user revoked access).
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
  if (!account?.access_token) return null;

  // Bail if the user hasn't granted gmail.readonly. Avoids confusing
  // 403s downstream and lets the caller surface "connect Gmail" UX.
  if (!account.scope?.includes("gmail.readonly")) return null;

  const now = Math.floor(Date.now() / 1000);
  // 60s clock-skew buffer so we don't hand out a token that expires
  // mid-request.
  const isExpired = !account.expires_at || account.expires_at - now < 60;
  if (!isExpired) return account.access_token;

  if (!account.refresh_token) {
    // Token expired and no refresh_token to swap — user needs to
    // re-auth (typical when refresh_token expired in Testing mode
    // after 7 days, or was revoked).
    return null;
  }

  const refreshed = await refreshGoogleAccessToken(account.refresh_token);
  if (!refreshed) return null;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

export interface GmailListEntry {
  id: string;
  threadId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: GmailMessagePart[];
    body?: { data?: string; size?: number };
    mimeType?: string;
  };
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

// Booking-confirmation senders. Conservative starting set — covers the
// big aggregators we already partner with. Extend as we observe what
// real users get. Inclusive Gmail OR query — keep it under Gmail's
// query length limit (well under 2KB at this size).
export const BOOKING_SENDER_QUERY = [
  "from:noreply@booking.com",
  "from:noreply@airbnb.com",
  "from:reservations@hotels.com",
  "from:reservations@expedia.com",
  "from:noreply@expedia.com",
  "from:vrbo.com",
  "from:reservations@marriott.com",
  "from:hilton.com",
  "from:hyatt.com",
  "from:ihg.com",
  "from:accor.com",
  "from:tripadvisor.com",
  "from:viator.com",
  "from:klook.com",
  "from:getyourguide.com",
  "from:tiqets.com",
  "from:travelpayouts.com",
  "from:aviasales.com",
  "from:hotellook.com",
  "from:skyscanner.net",
  "from:kayak.com",
  "from:itinerary@united.com",
  "from:delta.com",
  "from:americanairlines.com",
  "from:ba.com",
  "from:lufthansa.com",
  "from:airfrance.com",
  "from:ana.co.jp",
  "from:jal.com",
  "from:singaporeair.com",
  "from:emirates.com",
  "from:qatarairways.com",
].join(" OR ");

// Lists message IDs matching the booking-confirmation query. Pass
// `afterEpochSec` to scope to messages received after a timestamp
// (typical: lastGmailSyncAt). Returns up to `maxResults` IDs; caller
// is responsible for paging if more.
export async function listBookingConfirmations(
  accessToken: string,
  options: { afterEpochSec?: number; maxResults?: number } = {},
): Promise<GmailListEntry[]> {
  const { afterEpochSec, maxResults = 50 } = options;
  const q = afterEpochSec
    ? `(${BOOKING_SENDER_QUERY}) after:${afterEpochSec}`
    : `(${BOOKING_SENDER_QUERY}) newer_than:30d`;

  const url = new URL(`${GMAIL_API_BASE}/users/me/messages`);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(maxResults));

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    console.error("[gmail-client] list failed:", resp.status, await resp.text());
    return [];
  }
  const data = (await resp.json()) as { messages?: GmailListEntry[] };
  return data.messages ?? [];
}

// Fetches a single message in `full` format — includes headers, body,
// and attachment metadata (attachment bodies fetched separately if
// needed).
export async function fetchGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage | null> {
  const resp = await fetch(
    `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) {
    console.error("[gmail-client] fetch failed:", messageId, resp.status);
    return null;
  }
  return (await resp.json()) as GmailMessage;
}

// Convenience: pull the RFC 822 Message-ID header for dedup.
export function getRfc822MessageId(msg: GmailMessage): string | null {
  const h = msg.payload?.headers?.find(x => x.name.toLowerCase() === "message-id");
  return h?.value ?? null;
}

/**
 * Extract a usable text body from a Gmail message. Walks the MIME tree
 * preferring text/plain, falling back to text/html with tags stripped.
 * Returns the empty string when nothing is decodable — caller decides
 * whether that warrants skipping extraction.
 */
export function extractMessageBody(msg: GmailMessage): string {
  // Gmail uses URL-safe base64. Decoded body strings often contain CR/LF
  // pairs and quoted-printable artefacts — the flight extractor is tolerant.
  const decode = (b64: string): string => {
    try {
      const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(norm, "base64").toString("utf8");
    } catch {
      return "";
    }
  };

  const walk = (part: GmailMessage["payload"] | undefined): { plain: string; html: string } => {
    if (!part) return { plain: "", html: "" };
    let plain = "";
    let html = "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      plain += decode(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html += decode(part.body.data);
    }
    for (const child of part.parts ?? []) {
      const r = walk(child);
      plain += r.plain;
      html += r.html;
    }
    return { plain, html };
  };

  const { plain, html } = walk(msg.payload);
  if (plain.trim()) return plain;
  if (html.trim()) {
    // Cheap HTML → text strip. Confirmation emails rarely need full DOM
    // parsing; we just want enough chars for the LLM to read.
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  return msg.snippet ?? "";
}
