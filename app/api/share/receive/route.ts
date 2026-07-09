// POST /api/share/receive
//
// PWA Web Share Target endpoint. Registered in app/manifest.ts under
// share_target.action. Browsers (Chrome on Android + any PWA that supports
// the Web Share Target Level 2 API) POST here when the user picks geknee
// in the OS share sheet.
//
// The manifest accepts three text params (title, text, url) and one file
// param (media). We normalize to a single canonical payload and 303-redirect
// to /share/receive?… so the page component can render the picker.
//
// v1: text / URL shares work end-to-end. Media shares hit a placeholder
// screen that tells the user to install the iOS or Android app —
// implementing persistent blob storage on Vercel needs Vercel Blob or a
// KV stash which is a separate wiring pass.

import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    const login = new URL("/api/auth/signin", req.url);
    login.searchParams.set("callbackUrl", "/share/receive");
    return Response.redirect(login.toString(), 303);
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "form-data required" }, { status: 400 });
  }

  const title = (form.get("title") as string | null)?.trim() ?? "";
  const text = (form.get("text") as string | null)?.trim() ?? "";
  const url = (form.get("url") as string | null)?.trim() ?? "";
  const media = form.get("media");
  const hasMedia = media instanceof Blob && media.size > 0;

  // Order of preference: explicit URL, first URL in text, raw text, title,
  // media-only.
  const primaryUrl = url || firstUrlIn(text) || firstUrlIn(title);
  const target = new URL("/share/receive", req.url);
  if (primaryUrl) {
    target.searchParams.set("url", primaryUrl);
  } else if (text) {
    target.searchParams.set("text", text);
  } else if (title) {
    target.searchParams.set("text", title);
  } else if (hasMedia) {
    target.searchParams.set("media", "unsupported");
  } else {
    target.searchParams.set("error", "empty");
  }
  return Response.redirect(target.toString(), 303);
}

const URL_RE = /https?:\/\/[^\s]+/i;
function firstUrlIn(s: string): string {
  if (!s) return "";
  const m = s.match(URL_RE);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : "";
}
