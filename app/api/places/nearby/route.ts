// app/api/places/nearby/route.ts
// On-demand nearest-of-type search (pharmacy | hospital) for the Safety card.
// Called ONLY when the user taps "find nearest" — never on page load.
// Uses Places Nearby Search (New) with a Basic field mask to stay in the
// cheapest SKU, per the Google Maps cost rules in CLAUDE.md.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

const ALLOWED = new Set(["pharmacy", "hospital"]);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!ALLOWED.has(type) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Server-only key (IP-restricted, no app restriction). The NEXT_PUBLIC key is
  // HTTP-referrer restricted and would fail this server-to-server call.
  const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "misconfigured" }, { status: 500 });

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Basic-SKU field mask only.
        "X-Goog-FieldMask":
          "places.displayName,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.formattedAddress",
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 5,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "places_failed" }, { status: 502 });
    const data = await res.json();
    const places = (data.places ?? []).map((p: {
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      nationalPhoneNumber?: string;
      currentOpeningHours?: { openNow?: boolean };
      formattedAddress?: string;
    }) => ({
      name: p.displayName?.text ?? "Unknown",
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      phone: p.nationalPhoneNumber ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      address: p.formattedAddress ?? null,
    }));
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: "places_failed" }, { status: 502 });
  }
}
