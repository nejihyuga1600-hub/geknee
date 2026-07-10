// /saves — aggregated "Your Saves" view. Search + category filter across
// every SavedPlace the user has, regardless of trip. Client-side reactive
// after initial SSR fetch.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SavesClient from "./SavesClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your saves — geknee",
};

export default async function SavesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin?callbackUrl=/saves");
  }
  return <SavesClient />;
}
