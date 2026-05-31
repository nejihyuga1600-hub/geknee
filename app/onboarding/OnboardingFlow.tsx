'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CheckoutButton from '../pricing/CheckoutButton';

// ── Brand tokens — match the cosmic design used across /pricing and /plan ──
const T = {
  bg: '#05050f',
  bg2: '#0a0a1f',
  ink: '#f2f2f8',
  inkDim: '#a8a8c0',
  inkMute: '#6b6b85',
  accent: '#a78bfa',
  accent2: '#7dd3fc',
  gold: '#fbbf24',
  success: '#7cff97',
  border: 'rgba(167, 139, 250, 0.18)',
  borderHi: 'rgba(167, 139, 250, 0.40)',
  serif: 'var(--font-display), Georgia, serif',
  ui: "var(--font-ui), 'Inter', system-ui, sans-serif",
  mono: 'var(--font-mono-display), ui-monospace, monospace',
  ease: 'cubic-bezier(0.23, 1, 0.32, 1)',
} as const;

const TIERS = [
  { id: 'stone',     name: 'Stone',     color: '#a8a8a8', drop: '70%' },
  { id: 'bronze',    name: 'Bronze',    color: '#cd7f32', drop: '38%' },
  { id: 'silver',    name: 'Silver',    color: '#e8e8e8', drop: '18%' },
  { id: 'gold',      name: 'Gold',      color: '#fbbf24', drop: '7%' },
  { id: 'diamond',   name: 'Diamond',   color: '#b9f2ff', drop: '2.4%' },
  { id: 'aurora',    name: 'Aurora',    color: '#7cff97', drop: '0.6%' },
  { id: 'celestial', name: 'Celestial', color: '#a78bfa', drop: '0.1%' },
];

const STYLES = [
  { id: 'culture',   glyph: '◈', name: 'Culture',   desc: 'Museums, ruins, old towns' },
  { id: 'food',      glyph: '◉', name: 'Foodie',    desc: 'Markets, kitchens, street eats' },
  { id: 'outdoors',  glyph: '◬', name: 'Outdoors',  desc: 'Hikes, surf, off-grid' },
  { id: 'nightlife', glyph: '✦', name: 'Nightlife', desc: 'Bars, music, late nights' },
  { id: 'wellness',  glyph: '◯', name: 'Wellness',  desc: 'Spas, onsen, slow days' },
  { id: 'luxury',    glyph: '◆', name: 'Luxury',    desc: 'Suites, fine dining' },
];

const DESTS = ['Japan', 'Italy', 'Iceland', 'Peru', 'Morocco', 'Thailand', 'Greece', 'Portugal', 'Vietnam', 'Norway', 'Egypt', 'Mexico'];

const PACE = [
  { id: 'slow',     name: 'Slow & deep', desc: 'Few places, lots of time' },
  { id: 'balanced', name: 'Balanced',    desc: 'A bit of everything' },
  { id: 'packed',   name: 'Pack it in',  desc: 'See as much as I can' },
];

const TOTAL_STEPS = 9;
const PROGRESS_DENOM = 7;
const STORAGE_KEY = 'geknee:onboarding-v1';

type Plan = 'monthly' | 'yearly';
type Data = {
  styles: string[];
  dests: string[];
  pace: string;
  name: string;
  plan: Plan;
};

const EMPTY: Data = { styles: [], dests: [], pace: '', name: '', plan: 'yearly' };

// Deterministic starfield — no hydration mismatch, no per-render churn.
const STARS = Array.from({ length: 80 }, (_, i) => {
  const r = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
  return {
    size: r(1) * 1.6 + 0.4,
    left: r(2) * 100,
    top: r(3) * 100,
    delay: -r(4) * 4,
    dur: 2 + r(5) * 4,
  };
});

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>(EMPTY);

  // Restore in-progress onboarding state from a prior visit (safe parse).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setData({ ...EMPTY, ...parsed });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Persist on every change so a refresh mid-flow doesn't lose answers.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, [data]);

  const go = (delta: number) => setStep((s) => Math.max(0, Math.min(TOTAL_STEPS - 1, s + delta)));
  const update = (patch: Partial<Data>) => setData((d) => ({ ...d, ...patch }));
  const toggle = (key: 'styles' | 'dests', val: string) =>
    setData((d) => {
      const arr = d[key].includes(val) ? d[key].filter((x) => x !== val) : [...d[key], val];
      return { ...d, [key]: arr };
    });

  const showProgress = step > 0 && step < 8;
  const showBack = step > 0 && step < 8;
  const showSkip = step > 0 && step < 7;

  const finishFree = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    router.push('/plan/location');
  };

  return (
    <main
      style={{
        minHeight: '100svh',
        background: `
          radial-gradient(ellipse at 30% 10%, rgba(167,139,250,0.14), transparent 55%),
          radial-gradient(ellipse at 80% 60%, rgba(125,211,252,0.08), transparent 55%),
          ${T.bg}
        `,
        color: T.ink,
        fontFamily: T.ui,
        overflowX: 'hidden',
        position: 'relative',
        display: 'grid',
        placeItems: 'start center',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gk-tw { 0%, 100% { opacity: 0.15 } 50% { opacity: 0.7 } }
        @keyframes gk-spin { to { transform: rotate(360deg); } }
        @keyframes gk-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gk-pulse { 0%, 100% { opacity: .5 } 50% { opacity: 1 } }
        .gk-star { animation: gk-tw 4s ease-in-out infinite; }
        .gk-globe { animation: gk-spin 26s linear infinite; }
        .gk-tier-row { animation: gk-slide-up 480ms ${T.ease} both; }
        .gk-btn { transition: transform 120ms ${T.ease}, background 160ms; }
        .gk-btn:active:not(:disabled) { transform: scale(0.98); }
        .gk-btn:disabled { cursor: not-allowed; opacity: 0.4; }
        .gk-step { transition: opacity 420ms ${T.ease}, transform 420ms ${T.ease}; }
        .gk-pulse-anim { animation: gk-pulse 1.2s ease-in-out infinite; }
        .gk-choice:hover { border-color: ${T.borderHi}; }
        .gk-chip:hover { border-color: ${T.borderHi}; color: ${T.ink}; }
        .gk-field:focus { border-color: ${T.accent}; outline: none; }
      `}} />

      {/* Starfield */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={i}
            className="gk-star"
            style={{
              position: 'absolute',
              width: s.size, height: s.size,
              left: `${s.left}%`, top: `${s.top}%`,
              borderRadius: '50%', background: '#fff',
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        ))}
      </div>

      {/* Stage — clamps to a phone-ish width on desktop so the line lengths stay tight */}
      <section
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          maxWidth: 460,
          minHeight: '100svh',
          padding: '64px 28px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top chrome — progress bar, back, skip */}
        {showProgress && (
          <div
            style={{
              position: 'absolute', top: 44, left: 28, right: 28,
              height: 3, background: 'rgba(255,255,255,0.08)',
              borderRadius: 2, overflow: 'hidden', zIndex: 10,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (step / PROGRESS_DENOM) * 100)}%`,
                background: `linear-gradient(90deg, ${T.accent}, ${T.accent2})`,
                borderRadius: 2,
                transition: `width 480ms ${T.ease}`,
              }}
            />
          </div>
        )}
        {showBack && (
          <button
            onClick={() => go(-1)}
            aria-label="Back"
            style={{
              position: 'absolute', top: 28, left: 22, zIndex: 10,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${T.border}`,
              color: T.inkDim, cursor: 'pointer', fontSize: 16,
              display: 'grid', placeItems: 'center', lineHeight: 1,
            }}
          >
            ‹
          </button>
        )}
        {showSkip && (
          <button
            onClick={() => setStep(8)}
            style={{
              position: 'absolute', top: 34, right: 26, zIndex: 10,
              fontFamily: T.mono, fontSize: 11,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: T.inkMute, background: 'none', border: 'none',
              cursor: 'pointer', padding: 4,
            }}
          >
            Skip
          </button>
        )}

        {/* 0 · WELCOME */}
        <Slide active={step === 0}>
          <div style={{ marginTop: 20 }}>
            <Eyebrow>✦ welcome to geknee</Eyebrow>
            <Title>The world is<br/>a <Em>collection</Em>.</Title>
            <Body>Sixty monuments. Seven rarity tiers. The only way to earn the rare ones is to go there.</Body>
          </div>
          <Globe />
          <FooterArea>
            <PrimaryButton onClick={() => go(1)}>Show me how →</PrimaryButton>
            <GhostButton onClick={() => setStep(8)} small>I already have an account</GhostButton>
          </FooterArea>
        </Slide>

        {/* 1 · EDUCATE: concept */}
        <Slide active={step === 1}>
          <Eyebrow>§ 01 · the idea</Eyebrow>
          <Title>Every trip<br/><Em>unlocks</Em> something.</Title>
          <Body style={{ marginBottom: 24 }}>
            geknee turns travel into a collection game on a 3D globe. Visit a place in person,
            complete the quest, and a monument drops into your collection — forever.
          </Body>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'relative', width: 220, height: 220 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `1px solid ${T.border}`,
                display: 'grid', placeItems: 'center',
              }}>
                <div style={{
                  width: 130, height: 130, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #2a2a55, #0a0a1f 72%)',
                  boxShadow: '0 0 50px rgba(167,139,250,0.3)',
                }} />
              </div>
              {['◈','◉','◬','✦','◆','◯'].map((g, i) => {
                const a = (i / 6) * Math.PI * 2;
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: `calc(50% + ${Math.sin(a) * 102}px - 16px)`,
                      left: `calc(50% + ${Math.cos(a) * 102}px - 16px)`,
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(167,139,250,0.12)',
                      border: `1px solid ${T.border}`,
                      display: 'grid', placeItems: 'center',
                      color: T.accent, fontSize: 16,
                    }}
                  >
                    {g}
                  </div>
                );
              })}
            </div>
          </div>
          <FooterArea>
            <PrimaryButton onClick={() => go(1)}>Continue →</PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 2 · EDUCATE: rarity tiers */}
        <Slide active={step === 2}>
          <Eyebrow>§ 02 · rarity</Eyebrow>
          <Title>Seven tiers.<br/>One in a <Em>thousand</Em>.</Title>
          <Body style={{ marginBottom: 20 }}>
            Base tiers drop on your first visit. The rare ones demand harder quests, return trips, and timing.
          </Body>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {step === 2 && TIERS.map((t, i) => (
              <div
                key={t.id}
                className="gk-tier-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px', borderRadius: 12, marginBottom: 8,
                  border: `1px solid ${T.border}`,
                  background: 'rgba(255,255,255,0.02)',
                  animationDelay: `${i * 70}ms`,
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  display: 'grid', placeItems: 'center',
                  fontFamily: T.serif, fontSize: 14, fontStyle: 'italic',
                  border: `2px solid ${t.color}`, color: t.color,
                  background: `${t.color}18`, flexShrink: 0,
                }}>
                  {t.name[0]}
                </div>
                <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 400 }}>{t.name}</div>
                <div style={{
                  marginLeft: 'auto',
                  fontFamily: T.mono, fontSize: 10, letterSpacing: '0.1em',
                  color: T.inkMute,
                }}>drop {t.drop}</div>
              </div>
            ))}
          </div>
          <FooterArea>
            <PrimaryButton onClick={() => go(1)}>Got it →</PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 3 · EDUCATE: mechanic */}
        <Slide active={step === 3}>
          <Eyebrow>§ 03 · how it works</Eyebrow>
          <Title>Go. Prove.<br/><Em>Unlock.</Em></Title>
          <div style={{ flex: 1, marginTop: 14 }}>
            {[
              ['01', 'Show up', 'Your phone checks your GPS. Within 40m of a monument, the quest goes live.'],
              ['02', 'Do the quest', 'Photograph it at blue hour. Find the hidden angle. Be there at sunrise.'],
              ['03', 'Collect', 'A specimen card mints to your globe — your name, the date, the tier. One tap to share.'],
            ].map(([n, h, b]) => (
              <div
                key={n}
                style={{
                  display: 'flex', gap: 16, padding: '16px 0',
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <div style={{
                  fontFamily: T.serif, fontStyle: 'italic',
                  fontSize: 34, color: T.accent, lineHeight: 1,
                  width: 44, flexShrink: 0,
                }}>{n}</div>
                <div>
                  <div style={{ fontFamily: T.serif, fontSize: 19, margin: '0 0 5px', color: T.ink }}>{h}</div>
                  <div style={{ fontSize: 13, color: T.inkDim, lineHeight: 1.5 }}>{b}</div>
                </div>
              </div>
            ))}
          </div>
          <FooterArea>
            <PrimaryButton onClick={() => go(1)}>Makes sense →</PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 4 · ACTIVATE: travel style */}
        <Slide active={step === 4}>
          <Eyebrow>§ 04 · about you · 1 of 3</Eyebrow>
          <Title>What&apos;s your<br/><Em>kind</Em> of trip?</Title>
          <Body style={{ marginBottom: 18 }}>Pick a few. We&apos;ll tune your quests and recommendations.</Body>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {STYLES.map((s) => {
                const sel = data.styles.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="gk-choice"
                    onClick={() => toggle('styles', s.id)}
                    style={{
                      padding: '16px 14px', borderRadius: 14, cursor: 'pointer',
                      textAlign: 'left', color: T.ink, fontFamily: T.ui,
                      border: `1px solid ${sel ? T.accent : T.border}`,
                      background: sel ? 'rgba(167,139,250,0.10)' : 'rgba(255,255,255,0.02)',
                      boxShadow: sel ? '0 0 0 3px rgba(167,139,250,0.08)' : 'none',
                      transition: `all 150ms ${T.ease}`,
                    }}
                  >
                    <span style={{
                      fontSize: 22, color: T.accent,
                      display: 'block', marginBottom: 8,
                    }}>{s.glyph}</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: T.inkMute, marginTop: 2, lineHeight: 1.35 }}>{s.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <FooterArea>
            <PrimaryButton disabled={!data.styles.length} onClick={() => go(1)}>
              {data.styles.length ? `Continue · ${data.styles.length} picked →` : 'Pick at least one'}
            </PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 5 · ACTIVATE: dream destinations */}
        <Slide active={step === 5}>
          <Eyebrow>§ 04 · about you · 2 of 3</Eyebrow>
          <Title>Where are you<br/><Em>dreaming</Em> of?</Title>
          <Body style={{ marginBottom: 18 }}>Tap the places on your list. We&apos;ll surface their monuments first.</Body>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DESTS.map((d) => {
                const sel = data.dests.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className="gk-chip"
                    onClick={() => toggle('dests', d)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${sel ? T.accent : T.border}`,
                      background: sel ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.02)',
                      color: sel ? T.accent : T.inkDim,
                      fontSize: 13, fontWeight: 500, fontFamily: T.ui,
                      transition: `all 140ms ${T.ease}`,
                    }}
                  >
                    {sel && <span aria-hidden>✓</span>} {d}
                  </button>
                );
              })}
            </div>
          </div>
          <FooterArea>
            <PrimaryButton disabled={!data.dests.length} onClick={() => go(1)}>
              {data.dests.length ? `Continue · ${data.dests.length} places →` : 'Pick at least one'}
            </PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 6 · ACTIVATE: pace + name */}
        <Slide active={step === 6}>
          <Eyebrow>§ 04 · about you · 3 of 3</Eyebrow>
          <Title>Last thing.</Title>
          <Body style={{ marginBottom: 18 }}>How do you like to move, and what should we call you?</Body>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <span style={fieldLabelStyle}>Travel pace</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {PACE.map((p) => {
                const sel = data.pace === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="gk-choice"
                    onClick={() => update({ pace: p.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '16px 14px', borderRadius: 14, cursor: 'pointer',
                      textAlign: 'left', color: T.ink, fontFamily: T.ui,
                      border: `1px solid ${sel ? T.accent : T.border}`,
                      background: sel ? 'rgba(167,139,250,0.10)' : 'rgba(255,255,255,0.02)',
                      boxShadow: sel ? '0 0 0 3px rgba(167,139,250,0.08)' : 'none',
                      transition: `all 150ms ${T.ease}`,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${sel ? T.accent : T.inkMute}`,
                      flexShrink: 0, display: 'grid', placeItems: 'center',
                    }}>
                      {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 2, lineHeight: 1.35 }}>{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <span style={fieldLabelStyle}>Your name or handle</span>
            <input
              className="gk-field"
              placeholder="e.g. @maya"
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              style={{
                width: '100%', padding: '15px 16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.border}`,
                color: T.ink, fontFamily: T.ui, fontSize: 16,
              }}
            />
          </div>
          <FooterArea>
            <PrimaryButton disabled={!data.pace} onClick={() => go(1)}>Build my globe →</PrimaryButton>
          </FooterArea>
        </Slide>

        {/* 7 · PERSONALIZING */}
        <Personalizing active={step === 7} name={data.name} onDone={() => setStep(8)} />

        {/* 8 · PAYWALL */}
        <Paywall
          active={step === 8}
          data={data}
          update={update}
          onContinueFree={finishFree}
        />
      </section>
    </main>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────

function Slide({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className="gk-step"
      style={{
        position: active ? 'relative' : 'absolute',
        inset: active ? 'auto' : 0,
        padding: active ? 0 : '64px 28px 28px',
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
        transform: active ? 'translateY(0)' : 'translateY(14px)',
        display: 'flex', flexDirection: 'column',
        flex: active ? 1 : undefined,
        minHeight: active ? 'calc(100svh - 96px)' : undefined,
      }}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

function FooterArea({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 24 }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 11, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: T.accent, marginBottom: 18,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{
      fontFamily: T.serif, fontWeight: 300,
      fontSize: 'clamp(34px, 8vw, 42px)',
      lineHeight: 1, letterSpacing: '-0.025em',
      margin: '0 0 16px', color: T.ink,
    }}>
      {children}
    </h1>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <em style={{ fontStyle: 'italic', color: T.accent }}>{children}</em>;
}

function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 15, color: T.inkDim, lineHeight: 1.55, margin: 0, ...style }}>
      {children}
    </p>
  );
}

function PrimaryButton({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="gk-btn"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none', cursor: 'pointer', fontFamily: T.ui,
        fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
        padding: 16, borderRadius: 14, width: '100%',
        background: T.accent, color: T.bg,
        boxShadow: '0 10px 30px rgba(167,139,250,0.3)',
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children, onClick, small,
}: { children: React.ReactNode; onClick?: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      className="gk-btn"
      onClick={onClick}
      style={{
        cursor: 'pointer', fontFamily: T.ui,
        fontSize: small ? 13 : 15, fontWeight: 600, letterSpacing: '0.01em',
        padding: small ? 13 : 16, borderRadius: 14, width: '100%',
        background: 'rgba(255,255,255,0.04)', color: T.ink,
        border: `1px solid ${T.border}`,
      }}
    >
      {children}
    </button>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: T.mono, fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: T.inkMute, marginBottom: 8, display: 'block',
};

// ─── Globe vignette (welcome step) ────────────────────────────────────

function Globe() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', flex: 1, position: 'relative' }}>
      <div style={{
        position: 'absolute', width: 290, height: 290, borderRadius: '50%',
        border: `1px solid ${T.border}`, top: '50%', left: '50%',
        transform: 'translate(-50%,-50%) rotate(-18deg) scaleY(0.42)',
      }}>
        <span style={{
          position: 'absolute', top: -4, left: '50%',
          width: 9, height: 9, borderRadius: '50%',
          background: T.gold, boxShadow: `0 0 14px ${T.gold}`,
        }} />
      </div>
      <div
        className="gk-globe"
        style={{
          width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #2a2a55, #0a0a1f 72%)',
          boxShadow: 'inset -18px -26px 60px #000, 0 0 70px rgba(167,139,250,0.28)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <svg viewBox="-50 -50 100 100" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
          {[-60, -30, 0, 30, 60].map((l) => (
            <ellipse key={l} cx="0" cy={l * 0.5} rx="48" ry="3" fill="none" stroke={T.accent2} strokeWidth="0.3" />
          ))}
          {[-60, -30, 0, 30, 60].map((l) => (
            <ellipse
              key={'m' + l}
              cx={l * 0.4}
              cy="0"
              rx={Math.abs(Math.cos((l * Math.PI) / 180) * 48)}
              ry="48"
              fill="none"
              stroke={T.accent2}
              strokeWidth="0.3"
            />
          ))}
        </svg>
      </div>
      {[{ c: T.gold, t: '30%', l: '62%' }, { c: T.success, t: '58%', l: '34%' }, { c: T.accent, t: '44%', l: '72%' }].map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', top: p.t, left: p.l,
            width: 10, height: 10, borderRadius: '50%',
            background: p.c, boxShadow: `0 0 18px ${p.c}`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Personalizing loader ──────────────────────────────────────────────

function Personalizing({ active, name, onDone }: { active: boolean; name: string; onDone: () => void }) {
  const lines = useMemo(() => [
    'Reading your travel style',
    'Matching monuments to your dream list',
    'Tuning quest difficulty to your pace',
    'Drafting your first itinerary',
    'Rendering your personal globe',
  ], []);
  const [done, setDone] = useState(0);
  const calledRef = useRef(false);

  useEffect(() => {
    if (!active) { setDone(0); calledRef.current = false; return; }
    let i = 0;
    const t = setInterval(() => {
      i++; setDone(i);
      if (i >= lines.length) {
        clearInterval(t);
        if (!calledRef.current) {
          calledRef.current = true;
          setTimeout(onDone, 700);
        }
      }
    }, 720);
    return () => clearInterval(t);
  }, [active, lines.length, onDone]);

  return (
    <Slide active={active}>
      <div style={{ marginTop: 30 }}>
        <Eyebrow>✦ personalizing</Eyebrow>
        <Title>Building a geknee<br/>just for <Em>{name || 'you'}</Em>.</Title>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {lines.map((l, i) => {
          const isDone = i < done;
          const isActive = i === done;
          return (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 0', fontSize: 14,
                color: isDone ? T.ink : T.inkMute,
              }}
            >
              <div
                className={isActive ? 'gk-pulse-anim' : ''}
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'grid', placeItems: 'center', fontSize: 11,
                  border: `1.5px solid ${isDone ? T.success : isActive ? T.accent : T.inkMute}`,
                  color: isDone ? T.success : isActive ? T.accent : T.inkMute,
                  background: isDone ? 'rgba(124,255,151,0.12)' : 'transparent',
                  flexShrink: 0,
                }}
              >
                {isDone ? '✓' : isActive ? '◌' : '·'}
              </div>
              {l}
            </div>
          );
        })}
      </div>
      <div style={{ height: 40 }} />
    </Slide>
  );
}

// ─── Paywall ──────────────────────────────────────────────────────────

const STYLE_NAMES: Record<string, string> = {
  culture: 'Culture', food: 'Foodie', outdoors: 'Outdoors',
  nightlife: 'Nightlife', wellness: 'Wellness', luxury: 'Luxury',
};
const PACE_NAMES: Record<string, string> = {
  slow: 'Slow', balanced: 'Balanced', packed: 'Packed',
};

function Paywall({
  active, data, update, onContinueFree,
}: {
  active: boolean;
  data: Data;
  update: (p: Partial<Data>) => void;
  onContinueFree: () => void;
}) {
  const topStyle = data.styles[0] ? STYLE_NAMES[data.styles[0]] : 'Culture';
  const destCount = data.dests.length || 3;
  const paceLabel = data.pace ? `${PACE_NAMES[data.pace] ?? 'Balanced'} pace` : 'Balanced pace';
  const pills = [`${topStyle} quests`, `${destCount} dream destinations`, paceLabel, '7 rarity tiers'];

  const yearlySelected = data.plan === 'yearly';

  return (
    <Slide active={active}>
      <div style={{ marginTop: 6 }}>
        <Eyebrow>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: T.success, boxShadow: `0 0 8px ${T.success}`,
          }} />
          your geknee is ready
        </Eyebrow>
        <h1 style={{
          fontFamily: T.serif, fontWeight: 300,
          fontSize: 33, lineHeight: 1, letterSpacing: '-0.025em',
          margin: '0 0 16px', color: T.ink,
        }}>
          Unlock the full<br/><Em>experience</Em>, {data.name || 'traveler'}.
        </h1>
        <div style={{ margin: '14px 0 18px' }}>
          {pills.map((p) => (
            <span
              key={p}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 11px', borderRadius: 999,
                margin: '0 6px 6px 0',
                background: 'rgba(167,139,250,0.10)',
                border: `1px solid ${T.border}`,
                fontSize: 11, color: T.accent, fontWeight: 500,
              }}
            >
              ✦ {p}
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <PlanCard
          highlight={yearlySelected}
          selected={yearlySelected}
          onSelect={() => update({ plan: 'yearly' })}
          badge="SAVE 35%"
          label="✦ PRO · YEARLY"
          price="$39"
          priceSub="/ YEAR · $3.25/mo"
          body={`Unlimited AI trips · Pro-only skins · all ${topStyle.toLowerCase()} quests unlocked`}
        />
        <PlanCard
          highlight={!yearlySelected}
          selected={!yearlySelected}
          onSelect={() => update({ plan: 'monthly' })}
          label="◈ PRO · MONTHLY"
          price="$4.99"
          priceSub="/ MONTH"
          body="Cancel anytime · same Pro features"
        />
      </div>

      <FooterArea>
        <CheckoutButton
          interval={data.plan}
          label={data.plan === 'yearly' ? 'Start with Pro yearly →' : 'Start with Pro monthly →'}
          style={{
            border: 'none', cursor: 'pointer', fontFamily: T.ui,
            fontSize: 15, fontWeight: 600, letterSpacing: '0.01em',
            padding: 16, borderRadius: 14, width: '100%',
            background: T.accent, color: T.bg,
            boxShadow: '0 10px 30px rgba(167,139,250,0.3)',
          }}
        />
        <button
          type="button"
          className="gk-btn"
          onClick={onContinueFree}
          style={{
            cursor: 'pointer', fontFamily: T.ui,
            fontSize: 13, padding: 13, borderRadius: 14, width: '100%',
            border: 'none', background: 'none', color: T.inkMute, fontWeight: 600,
          }}
        >
          Continue with Free · 3 trips/mo
        </button>
        <div style={{
          textAlign: 'center', fontFamily: T.mono, fontSize: 9,
          letterSpacing: '0.1em', color: T.inkMute,
        }}>
          NO CHARGE TODAY · CANCEL ANYTIME · POWERED BY STRIPE
        </div>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <Link href="/pricing" style={{
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: T.inkMute, textDecoration: 'none',
          }}>
            Compare all plans →
          </Link>
        </div>
      </FooterArea>
    </Slide>
  );
}

function PlanCard({
  highlight, selected, onSelect, badge, label, price, priceSub, body,
}: {
  highlight: boolean;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
  label: string;
  price: string;
  priceSub: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: T.ui,
        border: `1px solid ${highlight ? T.borderHi : T.border}`,
        borderRadius: 18, padding: 20,
        background: highlight
          ? 'linear-gradient(165deg, rgba(167,139,250,0.12), rgba(125,211,252,0.04))'
          : 'rgba(255,255,255,0.02)',
        position: 'relative', overflow: 'hidden',
        boxShadow: selected ? '0 0 0 3px rgba(167,139,250,0.10)' : 'none',
        transition: `all 160ms ${T.ease}`,
        color: T.ink,
      }}
    >
      {badge && (
        <div style={{
          position: 'absolute', top: -1, right: 16,
          padding: '4px 10px',
          background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`,
          color: T.bg, borderRadius: '0 0 8px 8px',
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.14em',
        }}>{badge}</div>
      )}
      <div style={{
        fontFamily: T.mono, fontSize: 10,
        letterSpacing: '0.18em', color: highlight ? T.accent : T.inkMute,
        marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: T.serif, fontSize: 42, fontWeight: 300, color: T.ink }}>{price}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMute }}>{priceSub}</span>
      </div>
      <div style={{ fontSize: 12, color: T.inkDim, marginTop: 8, lineHeight: 1.5 }}>{body}</div>
    </button>
  );
}
