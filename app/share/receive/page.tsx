// /share/receive — the picker screen shown after a URL/text lands here from:
//   1. The PWA Web Share Target route handler (/api/share/receive redirect)
//   2. The iOS Share Extension "review in app" fallback (geknee://share deep link)
//   3. The Android share intent bridge (lib/native-share-bridge)
//
// Server Component: reads the payload from search params, gates on auth,
// and hands off to <ReceiveClient> for the unfurl + trip picker UX.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ReceiveClient from "./ReceiveClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Save to a trip — geknee",
};

export default async function ShareReceivePage({
  searchParams,
}: {
  searchParams: Promise<{
    url?: string;
    text?: string;
    media?: string;
    error?: string;
    stash?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=/share/receive");
  }
  const sp = await searchParams;
  return (
    <ReceiveClient
      url={sp.url ?? ""}
      text={sp.text ?? ""}
      media={sp.media ?? ""}
      error={sp.error ?? ""}
      stash={sp.stash ?? ""}
    />
  );
}
