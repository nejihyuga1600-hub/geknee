import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

// Rare = Gold or above. Mirrors SKIN_RANK >= 4 from the profile page.
// Listed inline to avoid pulling the LocationClient bundle into a server route.
const RARE_SKINS = ['gold', 'diamond', 'aurora', 'celestial'] as const;

export const metadata: Metadata = {
  title: 'Leaderboard · geknee',
  description: 'Top collectors by rare monument tiers earned. Gold, Diamond, Aurora, Celestial — only by visiting in person.',
  openGraph: {
    title: 'geknee leaderboard — most rare monuments collected',
    description: 'Who has unlocked the most rare-tier monuments. Gold and above only.',
    type: 'website',
    siteName: 'geknee',
  },
};

// Render at request time, never at build time. The page does a Prisma
// query against Neon, and Vercel's build container occasionally can't
// reach the pooler — when that happens with `revalidate = 60` (ISR),
// the initial prerender fails and the whole build crashes. Switching
// to force-dynamic moves the query to per-request, so transient DB
// blips during build no longer take down the deploy.
//
// Trade-off: lose the 60-second static cache. If the leaderboard ends
// up too chatty under load, swap to `unstable_cache` around the
// prisma call to recover the cache without a build-time prerender.
export const dynamic = 'force-dynamic';

type LeaderRow = {
  userId: string;
  handle: string;       // username if set, else cuid
  displayName: string;
  image: string | null;
  rare: number;         // distinct monuments with at least one rare-tier skin
  total: number;        // distinct monuments collected (any skin)
};

async function loadLeaderboard(limit = 50): Promise<LeaderRow[]> {
  // One pass over the rare rows is plenty for early-stage volume. When the
  // table grows past ~10k rows we'll move to a materialised view; until then
  // an in-memory reduce is simpler than a raw groupBy with distinct counts.
  const [rareRows, allRows] = await Promise.all([
    prisma.collectedMonument.findMany({
      where: { skin: { in: [...RARE_SKINS] } },
      select: { userId: true, monumentId: true },
    }),
    prisma.collectedMonument.findMany({
      select: { userId: true, monumentId: true },
    }),
  ]);

  // userId → set of distinct monumentIds (rare and total)
  const rareByUser = new Map<string, Set<string>>();
  for (const r of rareRows) {
    let s = rareByUser.get(r.userId);
    if (!s) { s = new Set(); rareByUser.set(r.userId, s); }
    s.add(r.monumentId);
  }
  const totalByUser = new Map<string, Set<string>>();
  for (const r of allRows) {
    let s = totalByUser.get(r.userId);
    if (!s) { s = new Set(); totalByUser.set(r.userId, s); }
    s.add(r.monumentId);
  }

  // Only users with at least one rare-tier monument show up on the board.
  // Empty boards make for sad pages — if no one qualifies, we'll surface a
  // friendly empty state instead of an inflated list of 0-rare rankings.
  const candidates = [...rareByUser.entries()]
    .map(([userId, set]) => ({
      userId,
      rare: set.size,
      total: totalByUser.get(userId)?.size ?? set.size,
    }))
    .sort((a, b) => (b.rare - a.rare) || (b.total - a.total))
    .slice(0, limit);

  if (candidates.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: candidates.map(c => c.userId) } },
    select: { id: true, name: true, username: true, image: true },
  });
  const byId = new Map(users.map(u => [u.id, u]));

  return candidates.map(c => {
    const u = byId.get(c.userId);
    return {
      userId: c.userId,
      handle: u?.username ?? c.userId,
      displayName: u?.name ?? u?.username ?? 'wanderer',
      image: u?.image ?? null,
      rare: c.rare,
      total: c.total,
    };
  });
}

export default async function LeaderboardPage() {
  const rows = await loadLeaderboard(50);

  return (
    <main style={{
      minHeight: '100svh',
      background: 'radial-gradient(ellipse at 30% 20%, rgba(255,215,0,0.10) 0%, rgba(6,8,22,0.97) 55%, #030510 100%)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, -apple-system, sans-serif',
      padding: '40px 20px 80px',
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Top nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            {String.fromCodePoint(0x2190)} geknee home
          </Link>
          <Link href="/plan/location" style={{
            background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)', padding: '8px 14px',
            borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700,
            textDecoration: 'none', boxShadow: '0 4px 14px rgba(167, 139, 250,0.35)',
          }}>
            Open the globe {String.fromCodePoint(0x27A4)}
          </Link>
        </div>

        {/* Title */}
        <header style={{ marginBottom: 36 }}>
          <div style={{
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--brand-accent)', marginBottom: 14,
          }}>
            {String.fromCodePoint(0x2726)} Top wanderers · Updated every minute
          </div>
          <h1 style={{
            margin: 0, fontSize: 'clamp(40px, 6vw, 64px)',
            fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05,
            fontFamily: 'var(--font-display), Georgia, serif',
            color: 'var(--brand-ink)',
          }}>
            The <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>Leaderboard.</em>
          </h1>
          <p style={{
            color: '#a8a8c0', fontSize: 14, marginTop: 14,
            maxWidth: 560, lineHeight: 1.5,
          }}>
            Ranked by rare-tier monuments — Gold, Diamond, Aurora, Celestial —
            earned only by going there and completing the harder quests.
          </p>
        </header>

        {/* Board */}
        {rows.length === 0 ? (
          <div style={{
            padding: 60, textAlign: 'center',
            border: '1px dashed rgba(148,163,184,0.25)', borderRadius: 16,
            color: '#94a3b8',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>{String.fromCodePoint(0x1F947)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#cbd5e1' }}>The first slot is open</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Be the first to unlock a Gold-tier monument.
            </div>
            <Link href="/plan/location" style={{
              display: 'inline-block', marginTop: 18,
              background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
              padding: '10px 18px', borderRadius: 10, color: '#fff',
              fontSize: 13, fontWeight: 800, textDecoration: 'none',
            }}>
              Open the globe {String.fromCodePoint(0x27A4)}
            </Link>
          </div>
        ) : (
          <div style={{
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            {rows.map((r, i) => {
              const rank = i + 1;
              const isPodium = rank <= 3;
              const accent = rank === 1 ? '#ffd700' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#cd7f32' : 'transparent';
              return (
                <Link
                  key={r.userId}
                  href={`/u/${r.handle}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 56px 1fr auto auto',
                    gap: 16,
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(148,163,184,0.10)',
                    color: '#e2e8f0',
                    textDecoration: 'none',
                    background: isPodium ? `linear-gradient(90deg, ${accent}11, transparent 40%)` : 'transparent',
                  }}
                >
                  <div style={{
                    fontSize: 22, fontWeight: 900,
                    color: isPodium ? accent : '#94a3b8',
                    textAlign: 'center',
                  }}>
                    {rank}
                  </div>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: r.image
                      ? `url(${r.image}) center/cover`
                      : 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
                    border: isPodium ? `2px solid ${accent}` : '2px solid rgba(148,163,184,0.2)',
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>@{r.handle}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#ffd700' }}>{r.rare}</div>
                    <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Rare
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 48 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#cbd5e1' }}>{r.total}</div>
                    <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Total
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 32, color: '#64748b', fontSize: 12 }}>
          Updated every minute. Tap any row to visit their globe.
        </p>
      </div>
    </main>
  );
}
