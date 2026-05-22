import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import StepPillNav from './components/StepPillNav';
import LandingTour from './components/landing/LandingTour';
import Link from 'next/link';

// ─── Landing · Passport-zine concept ─────────────────────────────────────────
// Replaces the previous dark-gradient hero with the design handoff's
// "Issue 001 · Spring '26" zine direction: cream paper with grain, scattered
// ink stamps, chunky typography, lavender highlights, and a hand-set
// editorial voice. The 3D globe lives inside /plan now — the front door is
// a magazine spread.

export const metadata: Metadata = {
  title: 'geknee — go there. prove it.',
  description: '60 monuments. 7 rarity tiers. Your phone checks you are actually there. No couch-unlocks. No loot boxes.',
  openGraph: {
    title: 'geknee — go there. prove it.',
    description: 'A travel collection game. Real-world check-ins, rare skins, hand-built itineraries. Free to start.',
    type: 'website',
    siteName: 'geknee',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geknee — go there. prove it.',
    description: 'A travel collection game. Real-world check-ins, rare skins, hand-built itineraries.',
  },
};

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';
const ACCENT2 = '#7dd3fc';
const ACCENT3 = '#fb923c';

const MONO = "var(--font-mono-display), ui-monospace, monospace";
const DISPLAY = "var(--font-display), Georgia, serif";

export default async function Home() {
  // Signed-in users skip the magazine landing and go straight to the globe.
  // The landing is reserved for first-time / unauthenticated visitors.
  const session = await auth();
  if (session?.user) {
    redirect('/plan/location');
  }

  return (
    <main style={{
      minHeight: '100svh',
      background: PAPER,
      color: INK,
      fontFamily: 'var(--font-ui), system-ui, -apple-system, sans-serif',
      position: 'relative',
      // overflow-clip clips overflow without creating a scroll container,
      // so position:sticky in descendants still works against the viewport.
      overflowX: 'clip',
    }}>
      {/* Hot-orange sunburst wash, top right */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '60%', height: '45%',
        background: 'radial-gradient(ellipse at 80% 20%, rgba(251,146,60,0.22), transparent 55%)',
        pointerEvents: 'none',
      }} />
      {/* Electric-blue wash, lower left */}
      <div style={{
        position: 'absolute', bottom: '35%', left: 0, width: '40%', height: '30%',
        background: 'radial-gradient(ellipse at 10% 80%, rgba(125,211,252,0.18), transparent 60%)',
        pointerEvents: 'none',
      }} />
      {/* Paper grain */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: `radial-gradient(circle at 1px 1px, ${INK} 1px, transparent 0)`,
        backgroundSize: '4px 4px',
        pointerEvents: 'none',
      }} />

      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: INK, color: PAPER,
            display: 'grid', placeItems: 'center',
            fontFamily: MONO, fontSize: 14, fontWeight: 900,
          }}>g</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>geknee</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Link href="/leaderboard" style={navLink}>Leaderboard</Link>
          <Link href="/pricing"     style={navLink}>Pricing</Link>
          <Link href="/plan" style={{
            padding: '10px 16px', background: INK, color: PAPER,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', textDecoration: 'none',
            boxShadow: `4px 4px 0 ${ACCENT}`,
            border: `2px solid ${INK}`,
          }}>
            Open the globe {String.fromCodePoint(0x2192)}
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '40px 32px 80px',
        position: 'relative', zIndex: 4,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 60, alignItems: 'center',
      }}>
        {/* Decorative HANOI ink stamp */}
        <div style={{
          position: 'absolute', top: 30, right: '38%',
          transform: 'rotate(-14deg)',
          opacity: 0.5, pointerEvents: 'none',
          display: 'none',
        }} className="hide-mobile">
          <InkStamp shape="circle" city="HANOI" code="HAN" date="04·18·26" glyph="✈" size={130} color="#dc2626" double />
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Issue badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 18px',
            background: INK, color: '#fde68a',
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            marginBottom: 24,
            border: `2px solid ${INK}`,
            boxShadow: `4px 4px 0 ${ACCENT}`,
            transform: 'rotate(-0.8deg)',
          }}>
            <span style={{ color: ACCENT3 }}>{String.fromCodePoint(0x25CE)}</span>
            <span>THE GEKNEE PASSPORT · ISSUE 001 · SPRING &apos;26</span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-ui), system-ui, sans-serif', fontWeight: 900,
            fontSize: 'clamp(64px, 11vw, 148px)', lineHeight: 0.86, margin: 0,
            letterSpacing: '-0.05em',
            color: INK, textTransform: 'uppercase',
          }}>
            GO<br />
            <span style={{
              background: ACCENT, padding: '0 0.1em',
              display: 'inline-block', transform: 'rotate(-1deg)',
              boxShadow: `5px 5px 0 ${INK}`,
              border: `2px solid ${INK}`,
            }}>THERE.</span><br />
            PROVE<br />
            <span style={{
              fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400,
              color: INK, textTransform: 'lowercase',
              letterSpacing: '-0.03em',
            }}>it.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 1.5vw, 20px)', lineHeight: 1.4,
            maxWidth: 480, marginTop: 32, color: '#3a3a30',
            fontWeight: 500,
          }}>
            60 monuments. 7 rarity tiers. Your phone checks you&apos;re actually there.{' '}
            <span style={{ background: '#fde68a', padding: '1px 4px' }}>
              No couch-unlocks. No loot boxes.
            </span>{' '}
            Go do the thing.
          </p>

          <div style={{
            display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <Link href="/plan" style={{
              padding: '16px 24px', background: INK, color: PAPER,
              fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', textDecoration: 'none',
              boxShadow: `4px 4px 0 ${ACCENT}`,
              border: `2px solid ${INK}`,
              transform: 'rotate(-0.5deg)',
              fontFamily: 'inherit',
            }}>
              Start collecting {String.fromCodePoint(0x2192)}
            </Link>
            <Link href="#how" style={{
              padding: '16px 24px', background: 'transparent', color: INK,
              fontSize: 14, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', textDecoration: 'none',
              border: `2px solid ${INK}`,
              fontFamily: 'inherit',
            }}>
              How it works
            </Link>
            <span style={{
              fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 14,
              color: '#6b6b55', marginLeft: 12, transform: 'rotate(-3deg)',
              display: 'inline-block',
            }}>
              {String.fromCodePoint(0x2191)} takes 40 seconds
            </span>
          </div>

          {/* Stat-credibility chip — borrowed from polarsteps' "4.8 ★ 370K
              RATINGS" social-proof shape, recast in geknee's zine voice.
              Says what the product IS (the rules of the game), not what
              other people think of it. */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 14,
            marginTop: 28, padding: '10px 18px',
            background: PAPER, color: INK,
            border: `2px solid ${INK}`,
            boxShadow: `3px 3px 0 ${ACCENT2}`,
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            <span><strong style={{ color: ACCENT }}>60</strong> monuments</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span><strong style={{ color: ACCENT }}>7</strong> tiers</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span><strong style={{ color: ACCENT3 }}>0</strong> grind</span>
          </div>
        </div>

        {/* Specimen card — passport page tilted */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'grid', placeItems: 'center',
          minHeight: 460,
        }}>
          <SpecimenCard />
        </div>
      </section>

      {/* ── 5-section product tour (polarsteps template) ─────────────────── */}
      <LandingTour />

      {/* ── Passport stamp strip ──────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1280, margin: '0 auto', padding: '20px 32px 60px',
        position: 'relative', zIndex: 4,
      }}>
        <div style={{
          background: PAPER, border: `2px solid ${INK}`,
          padding: '20px 24px',
          boxShadow: `5px 5px 0 ${ACCENT}`,
          transform: 'rotate(-0.4deg)',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: '#3a3a30', marginBottom: 14, fontWeight: 700,
          }}>
            ENTRIES &middot; SPRING &apos;26 &middot; SAMPLE LOG
          </div>
          {/* Hand-pasted passport spread — 6 monument photos under real ink
              stamps. Replaced the stand-alone InkStamp row so the section
              shows actual destinations (Hanoi, Kyoto, Lisbon, Teotihuacán,
              Reykjavik, Marrakech) instead of empty stamps. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/generated-images/passport-spread-hero.png"
            alt="Passport spread with monument photographs: One Pillar Pagoda Hanoi, Kiyomizu-dera Kyoto, Belém Tower Lisbon, Pyramid of the Sun Teotihuacán, Hallgrímskirkja Reykjavik, Koutoubia Mosque Marrakech — overlaid with vintage entry stamps."
            style={{
              display: 'block', width: '100%', height: 'auto',
              borderRadius: 4,
            }}
          />
        </div>
      </section>


      {/* ── Trophy reel · skin + the quest that earns it ──────────────────── */}
      {/* Six iconic monuments, one per rarity tier. Each card pairs the skin
          render with the single quest that earns that tier — so visitors see
          both the payoff and the cost before committing. */}
      <section style={{
        maxWidth: 1280, margin: '0 auto', padding: '20px 32px 80px',
        position: 'relative', zIndex: 4,
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em',
          color: '#3a3a30', textTransform: 'uppercase', fontWeight: 700,
          marginBottom: 14,
        }}>
          {String.fromCodePoint(0x00A7)} Trophy reel &middot; six skins, six quests
        </div>
        <h2 style={{
          fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 400,
          letterSpacing: '-0.025em', lineHeight: 1.05, margin: '0 0 12px',
          maxWidth: 820,
        }}>
          What you take home.{' '}
          <em style={{ color: ACCENT }}>And what it costs to earn it.</em>
        </h2>
        <p style={{
          fontSize: 14, color: '#3a3a30', lineHeight: 1.55, margin: '0 0 36px',
          maxWidth: 640,
        }}>
          Bronze comes easy. Celestial is earned by being there at exactly the
          right time. Each card shows the skin and the single quest that drops it.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 22,
        }}>
          {[
            // zoom + pos tuned per render so every monument body fills a similar
            // visual area on the card. Liberty needs the most zoom — small
            // statue, tall pedestal in the source render.
            {
              src: '/monument-snaps/colosseum.png',
              name: 'Colosseum', loc: 'Rome', tier: 'Bronze', color: '#b08d57', rot: -1.4,
              quest: 'Walk the gladiator entrance under the arena',
              verify: 'photo' as const,
              zoom: 1.40, pos: 'center 38%', bg: 'white' as const,
            },
            {
              src: '/monument-snaps/greatWall.png',
              name: 'Great Wall', loc: 'Beijing', tier: 'Silver', color: '#9ca3af', rot: 0.8,
              quest: 'Reach a watchtower and sign the visitor book',
              zoom: 1.45, pos: 'center 35%', bg: 'white' as const,
            },
            {
              src: '/monument-snaps/tajMahal.png',
              name: 'Taj Mahal', loc: 'Agra', tier: 'Gold', color: '#f59e0b', rot: -0.5,
              quest: 'Photograph the Taj at sunrise from the reflecting pool',
              verify: 'photo' as const,
              zoom: 1.40, pos: 'center 40%', bg: 'white' as const,
            },
            {
              src: '/monument-snaps/bigBen.png',
              name: 'Big Ben', loc: 'London', tier: 'Diamond', color: '#67e8f9', rot: 1.2,
              quest: 'Hear the chimes from the foot of the tower at midnight',
              zoom: 1.25, pos: 'center 42%', bg: 'white' as const,
            },
            {
              src: '/monument-snaps/statueLiberty.png',
              name: 'Statue of Liberty', loc: 'New York', tier: 'Aurora', color: '#34d399', rot: -0.9,
              quest: 'Catch the torch lit at golden hour on the first ferry',
              verify: 'photo' as const,
              zoom: 1.85, pos: 'center 22%', bg: 'cosmic' as const,
            },
            {
              src: '/monument-snaps/christRedeem.png',
              name: 'Christ the Redeemer', loc: 'Rio', tier: 'Celestial', color: '#818cf8', rot: 0.6,
              quest: 'Reach the summit at dawn through the cloud line',
              zoom: 1.35, pos: 'center 38%', bg: 'cosmic' as const,
            },
          ].map((s) => (
            <figure key={s.src} style={{
              margin: 0,
              background: PAPER,
              border: `2px solid ${INK}`,
              boxShadow: `4px 4px 0 ${s.color}`,
              transform: `rotate(${s.rot}deg)`,
              padding: 8,
              position: 'relative',
              display: 'flex', flexDirection: 'column',
              transition: 'transform 200ms ease',
            }}>
              {/* Clipping frame: each monument is zoomed to fill the same
                  visual area regardless of the real-world height baked into
                  the render. Liberty is a tiny figure on a giant pedestal,
                  Big Ben is already tall + narrow — per-monument zoom levels
                  flatten that out. Brightness lift makes dark renders (Aurora
                  Liberty, Celestial Christ) actually readable on cream paper. */}
              <div style={{
                width: '100%', aspectRatio: '3 / 4',
                overflow: 'hidden', background: PAPER,
                position: 'relative',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt={`${s.name} in ${s.loc} — ${s.tier} tier collectible skin`}
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: s.pos,
                    transform: `scale(${s.zoom})`,
                    transformOrigin: 'center 35%',
                    // White-bg renders (Bronze/Silver/Gold/Diamond) sit on a hard
                    // pure-white plate that bleeds into the cream paper. multiply
                    // blend knocks the white pixels down to the PAPER underneath
                    // (white × #f5f1e8 = #f5f1e8) while leaving the metallic
                    // figure intact. Cosmic-bg renders (Aurora/Celestial) already
                    // have rich dark backgrounds and would over-darken under
                    // multiply, so they render normally.
                    mixBlendMode: s.bg === 'white' ? 'multiply' : 'normal',
                    filter: 'none',
                  }}
                />
              </div>
              {/* Tier color strip + monument name + tier */}
              <figcaption style={{
                marginTop: 8,
                padding: '8px 10px',
                background: INK, color: PAPER,
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8,
              }}>
                <span style={{
                  fontFamily: DISPLAY, fontSize: 17, fontWeight: 400,
                  letterSpacing: '-0.01em', lineHeight: 1.1,
                }}>{s.name}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em',
                  fontWeight: 700, textTransform: 'uppercase',
                  color: s.color, whiteSpace: 'nowrap',
                }}>{s.tier}</span>
              </figcaption>
              <div style={{
                padding: '4px 10px 6px',
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
                color: '#6b6b55', textTransform: 'uppercase', fontWeight: 700,
                borderTop: `1px dashed ${INK}`, background: PAPER,
              }}>
                {s.loc}
              </div>
              {/* Quest panel — what you do to earn this tier */}
              <div style={{
                padding: '10px 10px 12px',
                borderTop: `1px dashed rgba(10,10,31,0.25)`,
                background: PAPER,
                display: 'flex', alignItems: 'flex-start', gap: 10,
                marginTop: 'auto',
              }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 14, height: 14, flexShrink: 0,
                    borderRadius: '50%', background: s.color,
                    border: `1.5px solid ${INK}`, marginTop: 3,
                    boxShadow: `1px 1px 0 ${INK}`,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 8, letterSpacing: '0.2em',
                    color: ACCENT, textTransform: 'uppercase', fontWeight: 800,
                    marginBottom: 4,
                  }}>
                    Quest
                    {s.verify === 'photo' && (
                      <span style={{ color: ACCENT3, marginLeft: 6 }}>· photo</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12, lineHeight: 1.4, color: INK,
                    fontStyle: 'italic',
                  }}>
                    {s.quest}
                  </div>
                </div>
              </div>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Mechanic narrative · 01 / 02 / 03 ─────────────────────────────── */}
      {/* Dark-section rhythm break — borrowed from polarsteps, which alternates
          cream and deep teal between sections. Inverting to ink + cream here
          makes the "rules of the game" feel like a specimen page cut from
          the rest of the zine. Sticky pill nav at the top mirrors polarsteps'
          PLAN / TRACK / RELIVE bottom-of-phone pill — geknee voice. */}
      <section
        id="how"
        style={{
          background: INK, color: PAPER,
          position: 'relative', zIndex: 4,
          padding: '60px 0 100px',
          marginTop: 20,
        }}
      >
        {/* Faint accent washes so it doesn't feel like a flat black slab. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 240,
          background: 'radial-gradient(ellipse at 20% 0%, rgba(167,139,250,0.18), transparent 60%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, right: 0, width: '50%', height: 200,
          background: 'radial-gradient(ellipse at 80% 100%, rgba(125,211,252,0.12), transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 32px',
          position: 'relative',
        }}>
          <StepPillNav
            steps={[
              { id: 'step-01', n: '01', label: 'Plan' },
              { id: 'step-02', n: '02', label: 'Go' },
              { id: 'step-03', n: '03', label: 'Prove' },
            ]}
          />

          <div style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em',
            color: ACCENT, textTransform: 'uppercase', fontWeight: 700,
            marginBottom: 14,
          }}>
            {String.fromCodePoint(0x00A7)} How it works · in three moves
          </div>
          <h2 style={{
            fontFamily: DISPLAY, fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 400,
            letterSpacing: '-0.025em', lineHeight: 1.05, margin: '0 0 36px',
            maxWidth: 720,
            color: PAPER,
          }}>
            You don&apos;t <em style={{ color: ACCENT }}>collect</em> from your couch. You earn it on foot.
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}>
            <div id="step-01" style={{ scrollMarginTop: 80 }}>
              <Step n="01" title="Plan it" body="Spin the globe, pick a destination, drop pins on a real map. Or let the genie draft an itinerary in under a minute." invert />
            </div>
            <div id="step-02" style={{ scrollMarginTop: 80 }}>
              <Step n="02" title="Go there" body="Your phone confirms you're actually there — geo + a photo. No couch-unlocks. No grinding. No loot boxes." invert />
            </div>
            <div id="step-03" style={{ scrollMarginTop: 80 }}>
              <Step n="03" title="Prove it" body="Each visit drops a monument card. Stone is easy; Aurora and Celestial are hard. The board ranks the rare ones." invert />
            </div>
          </div>
        </div>
      </section>

      {/* ── Pro band ──────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1280, margin: '0 auto', padding: '20px 32px 80px',
        position: 'relative', zIndex: 4,
      }}>
        <div style={{
          padding: 'clamp(28px, 4vw, 48px) clamp(28px, 4vw, 56px)',
          background: INK, color: PAPER,
          border: `2px solid ${INK}`,
          boxShadow: `6px 6px 0 ${ACCENT}`,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 32, alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
              color: ACCENT2, fontWeight: 700, marginBottom: 12,
            }}>
              {String.fromCodePoint(0x00A7)} GEKNEE PRO
            </div>
            <h3 style={{
              fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 400,
              letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0,
            }}>
              Unlimited trips. Deeper agents. <em style={{ color: ACCENT }}>One small fee.</em>
            </h3>
            <p style={{
              fontSize: 14, lineHeight: 1.55, marginTop: 16, opacity: 0.78, maxWidth: 480,
            }}>
              The free tier saves three trips at a time. Pro upgrades to unlimited trips,
              priority itinerary generation, the live-trip companion, and the file vault.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link href="/pricing" style={{
              padding: '16px 24px', background: ACCENT, color: INK,
              fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', textDecoration: 'none',
              border: `2px solid ${PAPER}`,
              fontFamily: 'inherit',
              textAlign: 'center',
            }}>See pricing</Link>
            <Link href="/plan" style={{
              padding: '16px 24px', background: 'transparent', color: PAPER,
              fontSize: 14, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', textDecoration: 'none',
              border: `2px solid ${PAPER}`, fontFamily: 'inherit',
              textAlign: 'center',
            }}>Start free</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        maxWidth: 1280, margin: '0 auto', padding: '40px 32px 60px',
        position: 'relative', zIndex: 4,
        borderTop: `2px solid ${INK}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          flexWrap: 'wrap', gap: 14, paddingTop: 24,
        }}>
          <div style={{
            fontFamily: DISPLAY, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em',
          }}>
            geknee · <em style={{ color: ACCENT }}>Issue 001</em>
          </div>
          <div style={{
            display: 'flex', gap: 24, fontSize: 13,
            color: '#3a3a30',
          }}>
            <Link href="/leaderboard" style={navLink}>Leaderboard</Link>
            <Link href="/pricing"     style={navLink}>Pricing</Link>
            <Link href="/plan"        style={navLink}>Open globe</Link>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
            color: '#6b6b55', textTransform: 'uppercase',
          }}>
            &copy; {new Date().getFullYear()} geknee · go there
          </div>
        </div>
      </footer>

      <style>{`
        @media (min-width: 900px) { .hide-mobile { display: block !important; } }
      `}</style>
    </main>
  );
}

const navLink = {
  fontSize: 13, color: INK, textDecoration: 'none', fontWeight: 600,
};

// ─── Step card ──────────────────────────────────────────────────────────────

function Step({
  n, title, body, invert = false,
}: { n: string; title: string; body: string; invert?: boolean }) {
  // Dark variant for the inverted "How it works" section — keeps the same
  // shape but reads on the ink background. Title stays cream, body softens.
  const cardBg = invert ? 'rgba(255,255,255,0.04)' : PAPER;
  const cardBorder = invert ? 'rgba(167,139,250,0.4)' : INK;
  const titleColor = invert ? PAPER : INK;
  const bodyColor = invert ? 'rgba(245,241,232,0.7)' : '#3a3a30';
  return (
    <div style={{
      padding: '28px 24px',
      background: cardBg, border: `2px solid ${cardBorder}`,
      boxShadow: `4px 4px 0 ${ACCENT}`,
      height: '100%',
    }}>
      <div style={{
        fontFamily: 'var(--font-ui), system-ui, sans-serif', fontWeight: 900,
        fontSize: 64, lineHeight: 1, color: ACCENT,
        letterSpacing: '-0.04em', marginBottom: 8,
      }}>{n}</div>
      <div style={{
        fontFamily: DISPLAY, fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em',
        marginBottom: 8, color: titleColor,
      }}>{title}</div>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: bodyColor, margin: 0 }}>{body}</p>
    </div>
  );
}

// ─── Specimen card ──────────────────────────────────────────────────────────

function SpecimenCard() {
  return (
    <div style={{
      width: 'min(100%, 360px)',
      background: PAPER,
      border: `2px solid ${INK}`,
      padding: 24, position: 'relative',
      boxShadow: `8px 8px 0 ${ACCENT}`,
      transform: 'rotate(2deg)',
    }}>
      <div style={{
        position: 'absolute', top: 18, right: -16, transform: 'rotate(8deg)',
        padding: '4px 16px', fontFamily: MONO, fontSize: 9, fontWeight: 800,
        letterSpacing: '0.18em', border: `2px solid ${ACCENT}`, color: ACCENT,
        background: PAPER, borderRadius: 3,
      }}>SPECIMEN</div>

      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em',
        color: '#6b6b55', marginBottom: 12, textTransform: 'uppercase',
      }}>
        ENTRY №042 · KIYOMIZU-DERA · KYOTO
      </div>
      <div style={{
        fontFamily: DISPLAY, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em',
        lineHeight: 1.05, color: INK,
      }}>
        Bronze tier &middot; <em style={{ color: ACCENT }}>caught the morning light.</em>
      </div>
      <div style={{
        marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <Pill>★ 4.7 difficulty</Pill>
        <Pill>16 quests</Pill>
        <Pill>Apr 15 &middot; 10:14 AM</Pill>
      </div>
      <div style={{
        marginTop: 22, paddingTop: 16, borderTop: `1px solid rgba(10,10,31,0.12)`,
        fontSize: 12, color: '#3a3a30', lineHeight: 1.55,
      }}>
        Wooden stage. Sakura window. Photo locked. Stone tier auto-drops the moment
        the geofence pings. Bronze and up &mdash; you complete a quest.
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(10,10,31,0.06)', color: INK, fontWeight: 700,
    }}>{children}</span>
  );
}

// ─── InkStamp ───────────────────────────────────────────────────────────────

function InkStamp({
  shape = 'circle', city, code, date, glyph, size = 100, color = '#dc2626', double = false,
}: {
  shape?: 'circle' | 'oval' | 'rect';
  city: string; code: string; date: string; glyph: string;
  size?: number; color?: string; double?: boolean;
}) {
  const radius = shape === 'rect' ? 4 : shape === 'oval' ? '50% / 38%' : '50%';
  const w = shape === 'oval' ? size * 1.25 : size;
  const h = shape === 'oval' ? size * 0.75 : size;
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      border: `${double ? 4 : 3}px ${double ? 'double' : 'solid'} ${color}`,
      color, opacity: 0.85,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 1,
      fontFamily: MONO, textTransform: 'uppercase', textAlign: 'center',
      letterSpacing: '0.18em', fontWeight: 700, fontSize: 9,
      padding: 4, boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 14, marginBottom: 1 }}>{glyph}</div>
      <div style={{ fontSize: 11, fontWeight: 800 }}>{city}</div>
      <div style={{ fontSize: 8 }}>{code}</div>
      <div style={{ fontSize: 7, opacity: 0.7 }}>{date}</div>
    </div>
  );
}
