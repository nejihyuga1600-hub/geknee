import MonumentSnapClient from "./MonumentSnapClient";

// Dev-only route: renders a single monument GLB on a transparent background
// at a curated camera angle. Consumed by bin/snap-monuments.mjs to produce
// the marketing card thumbnails in public/monument-snaps/.
//
// URL: /dev/monument-snap/<mk>?skin=<skinId>&w=600&h=800
// Defaults: skin=stone (or first available), 600×800 portrait.
//
// Returns a 404 in production builds so the route never ships to users.
export const dynamic = "force-dynamic";

export default async function MonumentSnapPage({
  params,
  searchParams,
}: {
  params: Promise<{ mk: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MONUMENT_SNAP !== "1") {
    return <div style={{ padding: 24, color: "#fff", background: "#000" }}>404 — dev-only route.</div>;
  }
  const { mk } = await params;
  const sp = await searchParams;
  const skin = typeof sp.skin === "string" ? sp.skin : "stone";
  const w = typeof sp.w === "string" ? parseInt(sp.w, 10) : 600;
  const h = typeof sp.h === "string" ? parseInt(sp.h, 10) : 800;
  return <MonumentSnapClient mk={mk} skin={skin} width={w} height={h} />;
}
