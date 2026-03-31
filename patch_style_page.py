#!/usr/bin/env python3
"""Rewrite style page with no problematic apostrophes."""

NEW_CONTENT = r"""'use client';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const STEPS = ['Purpose', 'Style', 'Budget', 'Interests', 'Constraints'];

const PURPOSES = [
  { id: 'vacation',   label: 'Vacation',            icon: String.fromCodePoint(0x1F3D6,0xFE0F) },
  { id: 'romance',    label: 'Romance / Honeymoon',  icon: String.fromCodePoint(0x1F491) },
  { id: 'adventure',  label: 'Adventure',            icon: String.fromCodePoint(0x1F9F3) },
  { id: 'culture',    label: 'Culture & History',    icon: String.fromCodePoint(0x1F3DB,0xFE0F) },
  { id: 'food',       label: 'Food & Cuisine',       icon: String.fromCodePoint(0x1F35C) },
  { id: 'business',   label: 'Business',             icon: String.fromCodePoint(0x1F4BC) },
  { id: 'family',     label: 'Family Trip',          icon: String.fromCodePoint(0x1F46A) },
  { id: 'wellness',   label: 'Wellness / Retreat',   icon: String.fromCodePoint(0x1F9D8) },
];

const STYLES = [
  { id: 'luxury',     label: 'Luxury',               icon: String.fromCodePoint(0x1F451) },
  { id: 'eco',        label: 'Eco / Sustainable',    icon: String.fromCodePoint(0x1F33F) },
  { id: 'backpacker', label: 'Backpacker',            icon: String.fromCodePoint(0x1F9F3) },
  { id: 'local',      label: 'Local & Authentic',    icon: String.fromCodePoint(0x1F3E1) },
  { id: 'highlights', label: 'Fast-paced Highlights', icon: String.fromCodePoint(0x26A1) },
  { id: 'slow',       label: 'Slow Travel',           icon: String.fromCodePoint(0x1F422) },
  { id: 'offbeat',    label: 'Off the Beaten Path',  icon: String.fromCodePoint(0x1F5FA,0xFE0F) },
];

const BUDGETS = [
  { id: 'budget',   label: 'Budget',    sub: '< $100 / day',       icon: String.fromCodePoint(0x1F4B5), color: '#22c55e' },
  { id: 'midrange', label: 'Mid-range', sub: '$100 - $300 / day',  icon: String.fromCodePoint(0x1F4B0), color: '#3b82f6' },
  { id: 'upscale',  label: 'Upscale',   sub: '$300 - $600 / day',  icon: String.fromCodePoint(0x1F4B3), color: '#a855f7' },
  { id: 'luxury',   label: 'Luxury',    sub: '$600+ / day',         icon: String.fromCodePoint(0x1F48E), color: '#f59e0b' },
];

const INTERESTS = [
  { id: 'nature',       label: 'Nature & Wildlife', icon: String.fromCodePoint(0x26F0,0xFE0F) },
  { id: 'history',      label: 'History & Culture', icon: String.fromCodePoint(0x1F3DB,0xFE0F) },
  { id: 'food',         label: 'Food & Drink',       icon: String.fromCodePoint(0x1F35C) },
  { id: 'nightlife',    label: 'Nightlife',          icon: String.fromCodePoint(0x1F389) },
  { id: 'adventure',    label: 'Adventure Sports',   icon: String.fromCodePoint(0x1F3C4) },
  { id: 'shopping',     label: 'Shopping',           icon: String.fromCodePoint(0x1F6CD,0xFE0F) },
  { id: 'photography',  label: 'Photography',        icon: String.fromCodePoint(0x1F4F8) },
  { id: 'art',          label: 'Art & Museums',      icon: String.fromCodePoint(0x1F3A8) },
  { id: 'spiritual',    label: 'Spiritual Sites',    icon: String.fromCodePoint(0x26EA) },
  { id: 'beaches',      label: 'Beaches',            icon: String.fromCodePoint(0x1F3D6,0xFE0F) },
  { id: 'cities',       label: 'City Life',          icon: String.fromCodePoint(0x1F306) },
  { id: 'entertainment',label: 'Entertainment',      icon: String.fromCodePoint(0x1F3AD) },
];

const CONSTRAINTS = [
  { id: 'wheelchair', label: 'Wheelchair Accessible', icon: String.fromCodePoint(0x267F) },
  { id: 'kids',       label: 'Kid-Friendly',          icon: String.fromCodePoint(0x1F9D2) },
  { id: 'pets',       label: 'Pet-Friendly',          icon: String.fromCodePoint(0x1F43E) },
  { id: 'vegetarian', label: 'Vegetarian / Vegan',    icon: String.fromCodePoint(0x1F331) },
  { id: 'visafree',   label: 'Visa-Free Only',        icon: String.fromCodePoint(0x2708,0xFE0F) },
  { id: 'medical',    label: 'Medical Requirements',  icon: String.fromCodePoint(0x1F48A) },
  { id: 'halal',      label: 'Halal-Friendly',        icon: String.fromCodePoint(0x262A,0xFE0F) },
  { id: 'none',       label: 'No Constraints',        icon: String.fromCodePoint(0x2705) },
];

type Prefs = {
  purpose:     string;
  style:       string;
  budget:      string;
  interests:   string[];
  constraints: string[];
};

function Card({ item, active, onClick, showSub }: {
  item: { id: string; label: string; icon: string; sub?: string; color?: string };
  active: boolean;
  onClick: () => void;
  showSub?: boolean;
}) {
  const c = item.color ?? '#22d3ee';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '6px', padding: '14px 8px',
        borderRadius: '14px',
        border: active ? `2px solid ${c}` : '2px solid rgba(255,255,255,0.12)',
        background: active ? `linear-gradient(135deg,${c}22,${c}44)` : 'rgba(255,255,255,0.05)',
        color: '#fff', cursor: 'pointer', transition: 'all 0.18s ease',
        transform: active ? 'scale(1.04)' : 'scale(1)',
        boxShadow: active ? `0 0 18px ${c}55` : 'none',
      }}
    >
      <span style={{ fontSize: '26px', lineHeight: 1 }}>{item.icon}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
      {showSub && item.sub && (
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{item.sub}</span>
      )}
    </button>
  );
}

function SingleGrid({ items, selected, onSelect }: {
  items: { id: string; label: string; icon: string; sub?: string; color?: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
      gap: '10px', maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px',
    }}>
      {items.map((item) => (
        <Card key={item.id} item={item} active={selected === item.id}
          onClick={() => onSelect(item.id)} showSub />
      ))}
    </div>
  );
}

function MultiGrid({ items, selected, onToggle }: {
  items: { id: string; label: string; icon: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))',
      gap: '10px', maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px',
    }}>
      {items.map((item) => (
        <Card key={item.id} item={item} active={selected.includes(item.id)}
          onClick={() => onToggle(item.id)} />
      ))}
    </div>
  );
}

function StyleForm() {
  const params   = useSearchParams();
  const router   = useRouter();
  const location = params.get('location') ?? '';

  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>({
    purpose: '', style: '', budget: '', interests: [], constraints: [],
  });

  function setSingle(key: 'purpose' | 'style' | 'budget', val: string) {
    setPrefs((p) => ({ ...p, [key]: val }));
  }
  function toggleMulti(key: 'interests' | 'constraints', val: string) {
    setPrefs((p) => {
      const cur = p[key];
      return { ...p, [key]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] };
    });
  }
  function canAdvance() {
    if (step === 0) return !!prefs.purpose;
    if (step === 1) return !!prefs.style;
    if (step === 2) return !!prefs.budget;
    if (step === 3) return prefs.interests.length > 0;
    return true;
  }
  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      const q = new URLSearchParams({
        location,
        purpose:     prefs.purpose,
        style:       prefs.style,
        budget:      prefs.budget,
        interests:   prefs.interests.join(','),
        constraints: prefs.constraints.join(','),
      });
      router.push(`/plan/dates?${q.toString()}`);
    }
  }

  const TITLES = [
    'What is the reason for your trip?',
    'What is your travel style?',
    'What is your budget?',
    'What are you interested in?',
    'Any special requirements?',
  ];
  const SUBS = [
    'Choose the one that best describes your trip.',
    'How do you like to experience a destination?',
    'Pick your comfortable daily spend range.',
    'Select all that excite you -- we will build around them.',
    'We will accommodate your needs. Skip if none apply.',
  ];

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#060816' }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 40% 45%,rgba(30,70,200,0.35) 0%,rgba(6,8,22,0.96) 58%,#030510 100%)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.18) 1px,transparent 1px)',
        backgroundSize: '60px 60px', opacity: 0.35,
      }} />

      <div style={{
        position: 'relative', zIndex: 10,
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}>
        {location && (
          <div style={{
            marginBottom: '20px', padding: '6px 18px', borderRadius: '999px',
            background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.4)',
            color: '#67e8f9', fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em',
          }}>
            {'\u2708\uFE0F'} {location}
          </div>
        )}

        {/* Progress */}
        <div style={{ width: '100%', maxWidth: '560px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            {STEPS.map((s, i) => (
              <span key={s} style={{
                fontSize: '11px', fontWeight: 600, transition: 'color 0.3s',
                color: i <= step ? '#22d3ee' : 'rgba(255,255,255,0.3)',
              }}>{s}</span>
            ))}
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${((step + 1) / STEPS.length) * 100}%`,
              background: 'linear-gradient(90deg,#06b6d4,#3b82f6)', borderRadius: '999px',
              transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: '0 0 12px rgba(34,211,238,0.6)',
            }} />
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: '100%', maxWidth: '560px', borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          padding: '28px 28px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{
              fontSize: '12px', fontWeight: 700, color: '#22d3ee',
              letterSpacing: '0.1em', marginBottom: '6px', textTransform: 'uppercase',
            }}>
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.3 }}>
              {TITLES[step]}
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '6px 0 0' }}>
              {SUBS[step]}
            </p>
          </div>

          {step === 0 && <SingleGrid items={PURPOSES}    selected={prefs.purpose}     onSelect={(v) => setSingle('purpose', v)} />}
          {step === 1 && <SingleGrid items={STYLES}      selected={prefs.style}       onSelect={(v) => setSingle('style', v)} />}
          {step === 2 && <SingleGrid items={BUDGETS}     selected={prefs.budget}      onSelect={(v) => setSingle('budget', v)} />}
          {step === 3 && <MultiGrid  items={INTERESTS}   selected={prefs.interests}   onToggle={(v) => toggleMulti('interests', v)} />}
          {step === 4 && <MultiGrid  items={CONSTRAINTS} selected={prefs.constraints} onToggle={(v) => toggleMulti('constraints', v)} />}

          <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{
                flex: '0 0 auto', padding: '12px 22px', borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}>
                &larr; Back
              </button>
            )}
            <button onClick={next} disabled={!canAdvance()} style={{
              flex: 1, padding: '13px 24px', borderRadius: '14px', border: 'none',
              background: canAdvance()
                ? 'linear-gradient(135deg,#06b6d4,#3b82f6)' : 'rgba(255,255,255,0.1)',
              color: canAdvance() ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: '15px', fontWeight: 700,
              cursor: canAdvance() ? 'pointer' : 'default',
              boxShadow: canAdvance() ? '0 4px 20px rgba(6,182,212,0.4)' : 'none',
            }}>
              {step === STEPS.length - 1 ? '\u2728 Build My Trip' : 'Next \u2192'}
            </button>
          </div>
        </div>

        <a href="/" style={{ marginTop: '20px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
          &larr; Back to globe
        </a>
      </div>
    </main>
  );
}

export default function StylePage() {
  return (
    <Suspense fallback={
      <main style={{ position: 'fixed', inset: 0, background: '#060816', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px' }}>Loading...</p>
      </main>
    }>
      <StyleForm />
    </Suspense>
  );
}
"""

with open('app/plan/style/page.tsx', 'w', encoding='utf-8') as f:
    f.write(NEW_CONTENT.lstrip('\n'))
print('Written style page OK')
