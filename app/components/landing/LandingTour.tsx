// 5-section product tour — polarsteps' "phone-anchored feature page" template,
// recast in geknee's zine palette. Each section pairs a CSS-rendered phone
// mockup with an eyebrow / headline / sub triplet. Backgrounds alternate
// cream and ink for the polarsteps rhythm. A sticky pill at the top tracks
// which section is in view.

import Link from 'next/link';
import StepPillNav from '../StepPillNav';
import { PhoneFrame } from './PhoneFrame';
import {
  PhoneGet, PhonePlan, PhoneTrip, PhoneCollect, PhoneCircle,
} from './PhoneContent';
import WaitlistCta from './WaitlistCta';

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';
const ACCENT2 = '#7dd3fc';
const ACCENT3 = '#fb923c';
const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

interface SectionShellProps {
  id: string;
  invert?: boolean;
  eyebrow: string;
  eyebrowColor?: string;
  headline: React.ReactNode;
  body: React.ReactNode;
  phoneSide?: 'left' | 'right';
  phone: React.ReactNode;
  cta?: React.ReactNode;
}

function SectionShell({
  id, invert = false, eyebrow, eyebrowColor, headline, body, phoneSide = 'right', phone, cta,
}: SectionShellProps) {
  const bg = invert ? INK : PAPER;
  const fg = invert ? PAPER : INK;
  const subFg = invert ? 'rgba(245,241,232,0.72)' : '#3a3a30';
  return (
    <section
      id={id}
      style={{
        background: bg, color: fg,
        scrollMarginTop: 80,
        padding: '80px 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Soft accent wash on the dark sections so they don't read flat. */}
      {invert && (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 280,
            background: `radial-gradient(ellipse at ${phoneSide === 'right' ? '80%' : '20%'} 0%, rgba(167,139,250,0.16), transparent 60%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
            background: `radial-gradient(ellipse at ${phoneSide === 'right' ? '15%' : '85%'} 100%, rgba(125,211,252,0.10), transparent 60%)`,
            pointerEvents: 'none',
          }} />
        </>
      )}
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 60,
        alignItems: 'center',
        position: 'relative',
      }}>
        <div style={{
          order: phoneSide === 'right' ? 1 : 2,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: eyebrowColor ?? (invert ? ACCENT : ACCENT3),
            marginBottom: 14,
          }}>
            {eyebrow}
          </div>
          <h2 style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(32px, 4.4vw, 56px)', fontWeight: 400,
            letterSpacing: '-0.02em', lineHeight: 1.05,
            margin: '0 0 18px',
            color: fg,
          }}>
            {headline}
          </h2>
          <p style={{
            fontSize: 'clamp(15px, 1.2vw, 17px)', lineHeight: 1.55,
            color: subFg, margin: 0, maxWidth: 460,
          }}>
            {body}
          </p>
          {cta && <div style={{ marginTop: 28 }}>{cta}</div>}
        </div>
        <div style={{
          order: phoneSide === 'right' ? 2 : 1,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}>
          {phone}
        </div>
      </div>
    </section>
  );
}

export default function LandingTour() {
  return (
    <div style={{
      position: 'relative',
      // Establish a stacking context so the sticky pill (z-index 6) always
      // sits above section backgrounds even after section-by-section flips.
      isolation: 'isolate',
    }}>
      {/* Sticky pill at the top of the tour. The StepPillNav has its own
          internal position:sticky so we render it as a direct child here —
          no extra wrapper, no nested sticky. */}
      <StepPillNav
        steps={[
          { id: 'tour-get',     n: '01', label: 'Get' },
          { id: 'tour-plan',    n: '02', label: 'Plan' },
          { id: 'tour-trip',    n: '03', label: 'Trip' },
          { id: 'tour-collect', n: '04', label: 'Collect' },
          { id: 'tour-circle',  n: '05', label: 'Circle' },
        ]}
      />

      {/* 1 — Download the app */}
      <SectionShell
        id="tour-get"
        invert
        eyebrow="§ Get geknee"
        headline={<>Slip <em style={{ color: ACCENT }}>geknee</em> into your pocket.</>}
        body={<>Open-beta on iOS and Android. The web app lives at the same address — sign in once and your trips, monuments, and friends move with you.</>}
        phoneSide="right"
        phone={<PhoneFrame tint="lavender"><PhoneGet /></PhoneFrame>}
        cta={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <WaitlistCta platform="ios" style={{
              padding: '14px 22px', background: PAPER, color: INK,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none',
              border: `2px solid ${PAPER}`,
              boxShadow: `4px 4px 0 ${ACCENT}`,
            }}>
              Get on App Store
            </WaitlistCta>
            <WaitlistCta platform="android" style={{
              padding: '14px 22px', background: 'transparent', color: PAPER,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none',
              border: `2px solid ${PAPER}`,
            }}>
              Get on Google Play
            </WaitlistCta>
            <Link href="/plan" style={{
              padding: '14px 22px', background: 'transparent', color: ACCENT2,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}>
              Open on web →
            </Link>
          </div>
        }
      />

      {/* 2 — Manual plan / auto AI itinerary planner */}
      <SectionShell
        id="tour-plan"
        eyebrow="§ Itinerary builder"
        headline={<>Plan it yourself. Or let the <em style={{ color: ACCENT }}>genie</em>.</>}
        body={<>Spin the globe, drop pins on a real map, write your own day-by-day. Or ask the genie for a draft — under a minute, restaurants and transit lines included. Edit either way.</>}
        phoneSide="left"
        phone={<PhoneFrame tint="cyan" rotate={1.5}><PhonePlan /></PhoneFrame>}
        cta={
          <Link href="/plan" style={{
            display: 'inline-block',
            padding: '14px 22px', background: INK, color: PAPER,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', textDecoration: 'none',
            boxShadow: `4px 4px 0 ${ACCENT}`,
            border: `2px solid ${INK}`,
          }}>
            Plan a trip →
          </Link>
        }
      />

      {/* 3 — All your travel info */}
      <SectionShell
        id="tour-trip"
        invert
        eyebrow="§ Trip HQ"
        headline={<>Every <em style={{ color: ACCENT }}>reservation</em>, every day, in one place.</>}
        body={<>Flights, stays, day plans, weather, bookings, photos, expenses — all your travel info clipped into one trip. Nothing in fifteen apps. Offline-friendly so the airport Wi-Fi isn&apos;t the boss.</>}
        phoneSide="right"
        phone={<PhoneFrame tint="emerald" rotate={-1.5}><PhoneTrip /></PhoneFrame>}
      />

      {/* 4 — Collections (monuments, images, shareable catalog) */}
      <SectionShell
        id="tour-collect"
        eyebrow="§ Monument catalog"
        eyebrowColor={ACCENT3}
        headline={<><em style={{ color: ACCENT }}>60</em> places to prove you were there.</>}
        body={<>Each visit drops a card you actually earned. Bronze is easy; Aurora and Celestial want timing, weather, the right light. Your photo collection becomes a shareable catalog — a passport you can hand to a friend.</>}
        phoneSide="left"
        phone={<PhoneFrame tint="gold" rotate={1}><PhoneCollect /></PhoneFrame>}
      />

      {/* 5 — Group chats with friends + reliving images */}
      <SectionShell
        id="tour-circle"
        invert
        eyebrow="§ Travel circles"
        headline={<>Travel together. <em style={{ color: ACCENT }}>Relive</em> together.</>}
        body={<>Spin up a group chat per trip. Friends drop photos, stamps, and day notes that fold straight into the trip&apos;s recap — so a year later you&apos;re scrolling the trip and your friends&apos; voices are still in it.</>}
        phoneSide="right"
        phone={<PhoneFrame tint="rose" rotate={-1}><PhoneCircle /></PhoneFrame>}
      />
    </div>
  );
}
