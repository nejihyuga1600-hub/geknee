// CSS-rendered content for the 5 phone mockups in LandingTour.
// Each export is the "screen" of one phone. Lightweight, no external assets.
// Visuals lean on the geknee palette — lavender accent, paper highlights,
// gold + cyan dots from the v3 icon palette.

import {
  Globe, Pin, Monument, Sparkle, Calendar, Bed, Plane, Camera, Heart, Compass,
} from '@/lib/icons';

const ACCENT = '#a78bfa';
const ACCENT2 = '#7dd3fc';
const PAPER = '#f5f1e8';
const GOLD = '#fbbf24';
const ROSE = '#f87171';
const EMERALD = '#34d399';
const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

const eyebrow = {
  fontFamily: MONO, fontSize: 8, letterSpacing: '0.2em',
  textTransform: 'uppercase' as const, fontWeight: 700,
  color: 'rgba(245,241,232,0.55)',
};
const display = {
  fontFamily: DISPLAY, fontSize: 16, fontWeight: 400,
  letterSpacing: '-0.01em', color: PAPER,
};
const card = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, padding: 10,
};

// ─── 1 · Get the app ─────────────────────────────────────────────────

export function PhoneGet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
      <div style={{
        width: 76, height: 76, borderRadius: 18,
        background: `linear-gradient(135deg, ${ACCENT}, #6366f1)`,
        display: 'grid', placeItems: 'center',
        boxShadow: `0 12px 28px ${ACCENT}55`,
        fontFamily: DISPLAY, fontSize: 44, fontWeight: 700,
        color: PAPER, letterSpacing: '-0.05em',
      }}>g</div>
      <div style={{ ...display, fontSize: 22 }}>geknee</div>
      <div style={{ ...eyebrow, color: ACCENT2 }}>OPEN BETA · v1.0</div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: PAPER, color: '#0a0a1f',
          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', textAlign: 'center',
        }}>Get on App Store</div>
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${PAPER}`, color: PAPER,
          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', textAlign: 'center',
        }}>Get on Google Play</div>
      </div>
      <div style={{ ...eyebrow, marginTop: 8 }}>· OR ·</div>
      <div style={{ fontSize: 11, color: PAPER }}>Open on the web</div>
    </div>
  );
}

// ─── 2 · Plan (globe + AI chat) ──────────────────────────────────────

export function PhonePlan() {
  return (
    <>
      <div style={eyebrow}>Where are you wandering?</div>
      <div style={{ ...display, fontSize: 18 }}>
        Kyoto, <em style={{ fontStyle: 'italic', color: ACCENT }}>cherry blossoms</em>
      </div>
      {/* Globe */}
      <div style={{
        position: 'relative', alignSelf: 'center',
        width: 110, height: 110, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${ACCENT2}40, transparent 65%), radial-gradient(circle at 65% 75%, ${ACCENT}30, transparent 60%), #0a0a1f`,
        border: `1px solid ${ACCENT}40`,
        boxShadow: `0 0 40px ${ACCENT2}33, inset 0 0 30px rgba(0,0,0,0.4)`,
        display: 'grid', placeItems: 'center',
        marginTop: 6,
      }}>
        <Globe size={48} />
        <span style={{
          position: 'absolute', top: 18, left: 38,
          width: 6, height: 6, borderRadius: '50%',
          background: GOLD, boxShadow: `0 0 8px ${GOLD}`,
        }} />
        <span style={{
          position: 'absolute', bottom: 24, right: 28,
          width: 5, height: 5, borderRadius: '50%',
          background: ROSE, boxShadow: `0 0 8px ${ROSE}`,
        }} />
      </div>
      {/* AI chat bubble */}
      <div style={{
        ...card, marginTop: 10,
        background: `linear-gradient(135deg, rgba(167,139,250,0.18), rgba(125,211,252,0.10))`,
        border: `1px solid ${ACCENT}40`,
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <Sparkle size={14} />
        <div>
          <div style={{ ...eyebrow, color: ACCENT, fontSize: 7 }}>GENIE</div>
          <div style={{ fontSize: 10, lineHeight: 1.4, marginTop: 2 }}>
            5 days. Sunrise at Fushimi Inari, ramen in Pontocho, the bamboo grove on day 3 before crowds.
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 'auto',
        padding: '8px 10px', borderRadius: 8,
        background: ACCENT, color: '#0a0a1f',
        fontFamily: MONO, fontSize: 9, fontWeight: 800,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        textAlign: 'center',
      }}>Draft itinerary →</div>
    </>
  );
}

// ─── 3 · Trip info (timeline + chips) ────────────────────────────────

export function PhoneTrip() {
  return (
    <>
      <div style={eyebrow}>Rome · 6 nights</div>
      <div style={{ ...display, fontSize: 18 }}>
        La <em style={{ fontStyle: 'italic', color: ACCENT }}>dolce</em> vita
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
        <span style={{ ...eyebrow, color: ACCENT2, padding: '3px 7px', background: `${ACCENT2}18`, borderRadius: 4 }}>
          <Plane size={9} /> JFK→FCO
        </span>
        <span style={{ ...eyebrow, color: GOLD, padding: '3px 7px', background: `${GOLD}18`, borderRadius: 4 }}>
          <Bed size={9} /> Trastevere
        </span>
        <span style={{ ...eyebrow, color: EMERALD, padding: '3px 7px', background: `${EMERALD}18`, borderRadius: 4 }}>
          <Calendar size={9} /> Apr 18
        </span>
      </div>
      {/* Day list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {[
          { d: 'Day 1', t: 'Colosseum at golden hour', tag: 'monument', tagColor: GOLD },
          { d: 'Day 2', t: 'Vatican + Sistine Chapel',  tag: 'culture',  tagColor: ACCENT2 },
          { d: 'Day 3', t: 'Cooking class · Trastevere', tag: 'food',     tagColor: ROSE },
          { d: 'Day 4', t: 'Day trip · Tivoli',         tag: 'side',     tagColor: EMERALD },
        ].map((row, i) => (
          <div key={i} style={{ ...card, padding: 7, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, color: ACCENT, fontWeight: 700, minWidth: 26 }}>{row.d}</span>
            <span style={{ fontSize: 10, color: PAPER, flex: 1 }}>{row.t}</span>
            <span style={{
              fontSize: 7, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '2px 5px', borderRadius: 3,
              background: `${row.tagColor}22`, color: row.tagColor,
            }}>{row.tag}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8, color: 'rgba(245,241,232,0.55)' }}>
        <span>EST. TOTAL</span>
        <span style={{ color: GOLD, fontWeight: 700 }}>$1,840 PP</span>
      </div>
    </>
  );
}

// ─── 4 · Collect (monument grid) ─────────────────────────────────────

export function PhoneCollect() {
  const tile = (name: string, tier: string, color: string) => (
    <div key={name} style={{
      ...card, padding: 6,
      borderColor: `${color}55`,
      background: `linear-gradient(165deg, ${color}1a, rgba(255,255,255,0.03))`,
      aspectRatio: '3 / 4',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <Monument size={26} />
      </div>
      <div>
        <div style={{ fontSize: 8, fontWeight: 700, color: PAPER, lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 6, fontWeight: 700, letterSpacing: '0.1em', color, textTransform: 'uppercase' }}>{tier}</div>
      </div>
    </div>
  );
  return (
    <>
      <div style={eyebrow}>Monument catalog · 17 / 60</div>
      <div style={{ ...display, fontSize: 17 }}>Your <em style={{ fontStyle: 'italic', color: GOLD }}>passport</em></div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 6, marginTop: 6,
      }}>
        {tile('Colosseum', 'Bronze',    '#cd7f32')}
        {tile('Great Wall', 'Silver',   '#cbd5e1')}
        {tile('Taj Mahal',  'Gold',     GOLD)}
        {tile('Big Ben',    'Diamond',  '#60e8ff')}
        {tile('Liberty',    'Aurora',   EMERALD)}
        {tile('Redeemer',   'Celestial','#818cf8')}
      </div>
      <div style={{
        marginTop: 'auto', display: 'flex', gap: 6, alignItems: 'center',
        padding: '7px 9px', borderRadius: 8,
        background: 'rgba(167,139,250,0.12)',
        border: `1px solid ${ACCENT}33`,
      }}>
        <Sparkle size={11} />
        <div style={{ fontSize: 9, color: PAPER }}>Share your wrap →</div>
      </div>
    </>
  );
}

// ─── 5 · Circle (group chat + reliving images) ───────────────────────

export function PhoneCircle() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex' }}>
          {['#a78bfa', '#7dd3fc', '#fbbf24'].map((c, i) => (
            <div key={i} style={{
              width: 18, height: 18, borderRadius: '50%', background: c,
              marginLeft: i ? -6 : 0,
              border: '2px solid #0a0a1f',
            }} />
          ))}
        </div>
        <div>
          <div style={eyebrow}>Tokyo crew · 4 of 4 going</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 13 }}>Tokyo · Apr 18</div>
        </div>
      </div>

      {/* Photo grid bubble from a friend */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: ACCENT2, flexShrink: 0,
          display: 'grid', placeItems: 'center', fontFamily: DISPLAY,
          fontSize: 10, fontWeight: 700, color: '#0a0a1f',
        }}>S</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, fontSize: 7 }}>Sarah · Day 3</div>
          <div style={{
            marginTop: 3,
            padding: 6, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
            }}>
              {[ACCENT2, GOLD, ROSE, EMERALD].map((c, i) => (
                <div key={i} style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 6,
                  background: `linear-gradient(135deg, ${c}88, ${c}33)`,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Camera size={10} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: PAPER }}>
              Fushimi Inari at 6 AM. So worth it.
            </div>
          </div>
        </div>
      </div>

      {/* Friend's stamp drops in */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: GOLD, flexShrink: 0,
          display: 'grid', placeItems: 'center', fontFamily: DISPLAY,
          fontSize: 10, fontWeight: 700, color: '#0a0a1f',
        }}>M</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, fontSize: 7 }}>Mira just unlocked</div>
          <div style={{
            marginTop: 3,
            padding: '6px 8px', borderRadius: 10,
            background: `linear-gradient(135deg, ${GOLD}22, ${ACCENT}10)`,
            border: `1px solid ${GOLD}44`,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <Monument size={14} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: PAPER }}>Senso-ji · Gold</div>
              <div style={{ fontSize: 8, color: 'rgba(245,241,232,0.55)' }}>+ 1 to the trip recap</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 'auto',
        padding: '7px 10px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 99,
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9, color: 'rgba(245,241,232,0.65)',
      }}>
        <Heart size={10} />
        <span>Replay the trip →</span>
      </div>
    </>
  );
}
