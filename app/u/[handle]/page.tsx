import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PublicGlobeClient from './PublicGlobeClient';

// Monument display metadata — mirrors LocationClient's INFO. Kept inline so
// this route doesn't drag the 7k-line client bundle into its build graph.
const MONUMENT_NAMES: Record<string, string> = {
  eiffelTower: 'Eiffel Tower',
  colosseum: 'Colosseum',
  tajMahal: 'Taj Mahal',
  greatWall: 'Great Wall',
  statueLiberty: 'Statue of Liberty',
  sagradaFamilia: 'Sagrada Família',
  machuPicchu: 'Machu Picchu',
  christRedeem: 'Christ the Redeemer',
  angkorWat: 'Angkor Wat',
  pyramidGiza: 'Pyramids of Giza',
  goldenGate: 'Golden Gate',
  bigBen: 'Big Ben',
  acropolis: 'Acropolis',
  sydneyOpera: 'Sydney Opera',
  neuschwanstein: 'Neuschwanstein',
  stonehenge: 'Stonehenge',
  iguazuFalls: 'Iguazu Falls',
  tokyoSkytree: 'Tokyo Skytree',
  victoriaFalls: 'Victoria Falls',
};

const MONUMENT_CITY: Record<string, string> = {
  eiffelTower: 'Paris', colosseum: 'Rome', tajMahal: 'Agra', greatWall: 'China',
  statueLiberty: 'New York', sagradaFamilia: 'Barcelona', machuPicchu: 'Peru',
  christRedeem: 'Rio de Janeiro', angkorWat: 'Cambodia', pyramidGiza: 'Giza',
  goldenGate: 'San Francisco', bigBen: 'London', acropolis: 'Athens',
  sydneyOpera: 'Sydney', neuschwanstein: 'Bavaria', stonehenge: 'Wiltshire',
  iguazuFalls: 'Argentina/Brazil', tokyoSkytree: 'Tokyo', victoriaFalls: 'Zimbabwe/Zambia',
};

const SKIN_COLOR: Record<string, string> = {
  stone: '#a8a8a8', bronze: '#cd7f32', silver: '#e8e8e8', gold: '#ffd700',
  diamond: '#b9f2ff', aurora: '#7cff97', celestial: '#c4a7ff', obsidian: '#2e1a47',
};

const SKIN_RANK: Record<string, number> = {
  stone: 1, bronze: 2, silver: 3, gold: 4, diamond: 5, aurora: 6, celestial: 7,
};

async function lookupUser(handle: string) {
  // Try username first (the pretty path), then fall back to user.id (cuid)
  return (
    (await prisma.user.findUnique({
      where: { username: handle.toLowerCase() },
      select: { id: true, name: true, username: true, image: true, createdAt: true },
    })) ??
    (await prisma.user.findUnique({
      where: { id: handle },
      select: { id: true, name: true, username: true, image: true, createdAt: true },
    }))
  );
}

type Params = Promise<{ handle: string }>;
type SearchParams = Promise<{ unlocked?: string; skin?: string; q?: string }>;

export async function generateMetadata(
  { params, searchParams }: { params: Params; searchParams: SearchParams },
): Promise<Metadata> {
  const { handle } = await params;
  const sp = await searchParams;
  const user = await lookupUser(handle);
  if (!user) return { title: 'Not found · geknee' };

  const displayName = user.name ?? user.username ?? 'wanderer';
  const handleForUrl = user.username ?? user.id;
  // Count distinct monumentIds (not rows) so a user with gold+default rows
  // for the same monument doesn't double-count.
  const distinct = await prisma.collectedMonument.findMany({
    where: { userId: user.id },
    select: { monumentId: true },
    distinct: ['monumentId'],
  });
  const count = distinct.length;

  // If the URL carries ?unlocked=mk, this is a share link — emit the
  // monument-hero unlock card instead of the generic profile card so
  // Twitter/Discord/etc. unfurl with the new collectable.
  if (sp.unlocked && MONUMENT_NAMES[sp.unlocked]) {
    const mk = sp.unlocked;
    const skin = sp.skin && /^[a-z]+$/.test(sp.skin) ? sp.skin : 'gold';
    const monumentName = MONUMENT_NAMES[mk];
    const title = `${displayName} just collected ${monumentName} · geknee`;
    const desc = `${displayName} unlocked ${monumentName} on geknee. Visit their globe and start your own collection.`;
    // Forward the proof-photo Blob URL (from the unlock toast) so the OG
    // card includes the polaroid inset. Validated as an http(s) URL to
    // avoid letting the share param point at javascript:/data: schemes.
    const safeQ = sp.q && /^https?:\/\//.test(sp.q) ? sp.q : '';
    const ogUrl = `/api/og/share?mk=${encodeURIComponent(mk)}&skin=${encodeURIComponent(skin)}&u=${encodeURIComponent(displayName)}&h=${encodeURIComponent(handleForUrl)}${safeQ ? `&q=${encodeURIComponent(safeQ)}` : ''}`;
    return {
      title,
      description: desc,
      openGraph: {
        title, description: desc, url: `/u/${handleForUrl}?unlocked=${mk}`, siteName: 'geknee',
        images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
        type: 'website',
      },
      twitter: { card: 'summary_large_image', title, description: desc, images: [ogUrl] },
    };
  }

  const title = `${displayName}'s collection — ${count} monument${count === 1 ? '' : 's'} collected · geknee`;
  const desc = `${displayName} has collected ${count} monument${count === 1 ? '' : 's'} on geknee. See their rarity tiers and start your own collection.`;
  const ogUrl = `/api/og/profile?u=${encodeURIComponent(displayName)}&count=${count}`;
  return {
    title,
    description: desc,
    openGraph: {
      title, description: desc, url: `/u/${handleForUrl}`, siteName: 'geknee',
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
      type: 'profile',
    },
    twitter: { card: 'summary_large_image', title, description: desc, images: [ogUrl] },
  };
}

export default async function ProfilePage(
  { params, searchParams }: { params: Params; searchParams: SearchParams },
) {
  const { handle } = await params;
  const sp = await searchParams;
  const focusMk = sp.unlocked && MONUMENT_NAMES[sp.unlocked] ? sp.unlocked : undefined;
  const user = await lookupUser(handle);
  if (!user) notFound();

  const rows = await prisma.collectedMonument.findMany({
    where: { userId: user.id },
    orderBy: { collectedAt: 'desc' },
  });

  // Group rows by monumentId → the highest-rank active (or collected) skin is
  // what we display. "Owned skins" = all non-default rows (Gold, Aurora, etc).
  const byMk = new Map<string, { active?: string; owned: string[] }>();
  for (const r of rows) {
    const entry = byMk.get(r.monumentId) ?? { owned: [] };
    if (r.active && r.skin !== 'default') entry.active = r.skin;
    if (r.skin !== 'default') entry.owned.push(r.skin);
    byMk.set(r.monumentId, entry);
  }

  const collected = Array.from(byMk.entries()).map(([mk, e]) => {
    // Display skin: active, else highest-rank owned, else stone (base collected)
    const displaySkin = e.active ?? e.owned.sort((a, b) => (SKIN_RANK[b] ?? 0) - (SKIN_RANK[a] ?? 0))[0] ?? 'stone';
    return { mk, displaySkin, owned: e.owned };
  });

  const displayName = user.name ?? user.username ?? 'wanderer';
  const handleForUrl = user.username ?? user.id;
  const totalMonuments = collected.length;
  // Count monuments that have at least one skin above Silver (rank 4+ = Gold or rarer)
  const rareCount = collected.filter((c) => (SKIN_RANK[c.displaySkin] ?? 0) >= 4).length;

  // Avatar border: design says gold is reserved for magic moments only, not
  // a default chrome. So instead of always-gold, pick the user's RAREST
  // owned skin and use that as the border. Common collectors get the
  // lavender brand accent. Gold-tier collectors get the gold halo. The
  // glow is the user's own status reading at a glance.
  const topRank = collected.reduce((max, c) => Math.max(max, SKIN_RANK[c.displaySkin] ?? 0), 0);
  const topSkin = collected.find(c => (SKIN_RANK[c.displaySkin] ?? 0) === topRank)?.displaySkin;
  const avatarAccent = (topRank >= 4 && topSkin)
    ? (SKIN_COLOR[topSkin] ?? '#a78bfa')
    : '#a78bfa'; // lavender — var(--brand-accent)
  const memberSince = user.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  return (
    <main style={{
      minHeight: '100svh',
      background: 'radial-gradient(ellipse at 40% 30%, rgba(30,70,200,0.35) 0%, rgba(6,8,22,0.97) 55%, #030510 100%)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, -apple-system, sans-serif',
      padding: '40px 20px 80px',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Back + signed-out CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            {String.fromCodePoint(0x2190)} geknee home
          </Link>
          <Link href="/plan/location" style={{
            background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)', padding: '8px 14px',
            borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700,
            textDecoration: 'none', boxShadow: '0 4px 14px rgba(167, 139, 250,0.35)',
          }}>
            Start your own {String.fromCodePoint(0x27A4)}
          </Link>
        </div>

        {/* Header */}
        <header style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 40 }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: user.image
              ? `url(${user.image}) center/cover`
              : 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
            border: `3px solid ${avatarAccent}b3`,         // b3 = ~70% alpha
            boxShadow: `0 0 30px ${avatarAccent}33`,       // 33 = ~20% alpha
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontSize: 40, fontWeight: 500, letterSpacing: -1,
              fontFamily: 'var(--font-display), Georgia, serif',
              color: 'var(--brand-ink)',
            }}>
              {displayName}
            </h1>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              {user.username ? `@${user.username}` : 'wanderer'} · member since {memberSince}
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 14 }}>
              <Stat label="Collected" value={totalMonuments.toString()} />
              <Stat label="Rare tiers" value={rareCount.toString()} color="#ffd700" />
            </div>
          </div>
        </header>

        {/* Globe hero — visit-my-base spectator view. Empty collections still
            get a globe so visitors see the product, just with no monuments. */}
        <section style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          maxHeight: 560,
          marginBottom: 40,
          borderRadius: 20,
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 30% 20%, rgba(167, 139, 250,0.15) 0%, rgba(6,8,22,0.9) 70%)',
          border: '1px solid rgba(148,163,184,0.18)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        }}>
          <PublicGlobeClient
            collected={collected.map(c => ({ mk: c.mk, displaySkin: c.displaySkin }))}
            focusMk={focusMk}
          />
          {collected.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none',
              background: 'linear-gradient(180deg, transparent 60%, rgba(6,8,22,0.6))',
            }}>
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>
                {displayName} hasn{String.fromCodePoint(0x2019)}t collected any monuments yet
              </div>
            </div>
          )}
        </section>

        {/* Collection grid */}
        {collected.length === 0 ? (
          <div style={{
            padding: 60, textAlign: 'center',
            border: '1px dashed rgba(148,163,184,0.25)', borderRadius: 16,
            color: '#94a3b8',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>{String.fromCodePoint(0x1F30D)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#cbd5e1' }}>No monuments yet</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Plan a trip on the globe to unlock your first one.</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
          }}>
            {collected.map((c) => {
              const color = SKIN_COLOR[c.displaySkin] ?? '#ffd700';
              const rank = SKIN_RANK[c.displaySkin] ?? 1;
              return (
                <div
                  key={c.mk}
                  style={{
                    background: `radial-gradient(circle at 50% 30%, ${color}22, transparent 70%), rgba(15,23,42,0.7)`,
                    border: `1px solid ${color}55`,
                    borderRadius: 14, padding: '18px 14px', textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 64, height: 64, margin: '0 auto 10px',
                    borderRadius: '50%',
                    border: `3px solid ${color}`,
                    boxShadow: `0 0 22px ${color}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `radial-gradient(circle, ${color}33, transparent)`,
                  }}>
                    <span style={{ fontSize: 26 }}>{String.fromCodePoint(0x1F3DB)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    {MONUMENT_NAMES[c.mk] ?? c.mk}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {MONUMENT_CITY[c.mk] ?? ''}
                  </div>
                  <div
                    style={{
                      fontSize: 10, fontWeight: 900, letterSpacing: 1.2, marginTop: 8,
                      color, textTransform: 'uppercase',
                    }}
                  >
                    {c.displaySkin} · tier {rank}
                  </div>
                  {c.owned.length > 1 && (
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 4 }}>
                      {c.owned.slice(0, 5).map((s) => (
                        <span
                          key={s}
                          title={s}
                          style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: SKIN_COLOR[s] ?? '#888',
                            boxShadow: `0 0 6px ${SKIN_COLOR[s] ?? '#888'}`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <section style={{ marginTop: 56, textAlign: 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(167, 139, 250,0.2), rgba(167, 139, 250,0.2))',
            border: '1px solid rgba(167, 139, 250,0.4)',
            borderRadius: 16, padding: '36px 20px', maxWidth: 640, margin: '0 auto',
          }}>
            <h2 style={{
              fontSize: 28, fontWeight: 500, margin: 0,
              fontFamily: 'var(--font-display), Georgia, serif',
              letterSpacing: -0.6,
              color: 'var(--brand-ink)',
            }}>
              Start your own collection
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: 14, marginTop: 10 }}>
              Every trip you plan unlocks a new monument. Free forever.
            </p>
            <Link href="/plan/location" style={{
              display: 'inline-block', marginTop: 18,
              background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
              padding: '12px 22px', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 8px 22px rgba(167, 139, 250,0.4)',
            }}>
              Open the globe {String.fromCodePoint(0x27A4)}
            </Link>
          </div>
        </section>

        {/* Share this profile */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <code style={{
            background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.2)',
            padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#94a3b8',
          }}>
            geknee.com/u/{handleForUrl}
          </code>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}
