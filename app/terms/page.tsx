import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service · geknee',
  description: 'The rules for using geknee.',
};

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';

const LAST_UPDATED = 'May 7, 2026';
const ENTITY = 'geknee';
const CONTACT_EMAIL = 'support@geknee.com';
const GOVERNING_LAW = 'the State of Delaware, United States'; // update once incorporated

export default function TermsPage() {
  return (
    <main style={{ background: PAPER, color: INK, minHeight: '100vh', padding: '48px 20px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'var(--font-ui), system-ui, sans-serif', lineHeight: 1.6 }}>
        <Link href="/" style={{ color: ACCENT, fontSize: 13, textDecoration: 'none' }}>← geknee</Link>
        <h1 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 40, margin: '24px 0 8px' }}>Terms of Service</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 40 }}>Last updated: {LAST_UPDATED}</p>

        <p>
          Welcome to {ENTITY} (&quot;geknee&quot;, &quot;we&quot;, &quot;us&quot;). These Terms of Service
          (&quot;Terms&quot;) govern your access to and use of our website, mobile apps, and
          related services (the &quot;Service&quot;). By creating an account or using the
          Service, you agree to be bound by these Terms and by our{' '}
          <Link href="/privacy" style={{ color: ACCENT }}>Privacy Policy</Link>. If you
          don&apos;t agree, don&apos;t use the Service.
        </p>

        <Section title="1. The Service">
          <p>
            geknee is a travel-collection product. You plan trips, get AI-powered
            recommendations, and earn monument unlocks by physically visiting real-world
            landmarks (verified via your device&apos;s GPS and a photo). You can browse and
            book hotels, flights, and activities through our travel partners.
          </p>
        </Section>

        <Section title="2. Eligibility and accounts">
          <ul>
            <Li>You must be at least 13 years old (16 in the EEA/UK).</Li>
            <Li>You&apos;re responsible for keeping your password and account secure.</Li>
            <Li>You&apos;re responsible for everything done under your account.</Li>
            <Li>One person, one account. Don&apos;t share, sell, or transfer accounts.</Li>
            <Li>Accurate info — fake names or bogus emails may cause us to suspend the account.</Li>
          </ul>
        </Section>

        <Section title="3. Monument check-ins and unlocks">
          <ul>
            <Li>
              Monument unlocks are awarded for verified physical presence at the listed
              location at the time of check-in. We use your device GPS coordinates and EXIF
              metadata from your photo to verify presence.
            </Li>
            <Li>
              Faking a check-in (spoofing GPS, modifying photo metadata, using AI-generated
              images, etc.) is prohibited. Detected fakes will be reverted and may result
              in account suspension.
            </Li>
            <Li>
              Unlocked monuments and any associated 3D model skins are personal to your
              account. You may not sell, trade, or transfer them.
            </Li>
            <Li>
              We may add, remove, or change monuments and skins at any time. Existing
              unlocks remain in your account unless removed for fraud.
            </Li>
          </ul>
        </Section>

        <Section title="4. Bookings via travel partners">
          <p>
            When you book a hotel, flight, or activity through geknee, you&apos;re entering
            into a contract with the travel partner (e.g., Booking.com, Expedia, an
            airline, a tour operator) — not with geknee. Their terms, cancellation
            policies, and refund rules apply. We may earn an affiliate commission on
            bookings made through our links.
          </p>
          <ul>
            <Li>geknee doesn&apos;t guarantee partner pricing, availability, or service quality.</Li>
            <Li>Disputes about a booking should be raised with the partner first; we&apos;ll help where we can.</Li>
            <Li>We aren&apos;t responsible for cancellations, schedule changes, or trip disruptions caused by partners or third parties.</Li>
          </ul>
        </Section>

        <Section title="5. Subscriptions and payments">
          <ul>
            <Li>
              <b>Free tier:</b> core trip planning, monument check-ins, and a limited
              amount of AI assistance are free.
            </Li>
            <Li>
              <b>Pro subscription:</b> recurring billing (monthly or annual) for advanced
              features. Charged via Stripe (web and Android) or Apple In-App Purchase
              (iOS). Prices are shown at checkout.
            </Li>
            <Li>
              <b>Renewals:</b> Pro renews automatically until cancelled. Cancel anytime in
              your account settings (web/Android) or your Apple subscription manager (iOS).
              Cancellation stops future billing; the current paid period continues.
            </Li>
            <Li>
              <b>Refunds:</b> we offer refunds within 14 days of an unused first purchase.
              After that, fees are non-refundable except where required by law.
            </Li>
            <Li>
              <b>iOS purchases:</b> processed by Apple. Apple&apos;s refund and billing
              policies apply.
            </Li>
            <Li>
              <b>Taxes:</b> prices may exclude applicable taxes; we add them at checkout
              where required.
            </Li>
          </ul>
        </Section>

        <Section title="6. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <Li>Spoof your location, fake check-ins, or otherwise game the unlock system.</Li>
            <Li>Use the Service for anything illegal, harmful, harassing, or fraudulent.</Li>
            <Li>Reverse engineer, scrape, decompile, or otherwise extract source or data, except as required by law.</Li>
            <Li>Use the Service to build a competing product, train an AI model on our content, or resell our data.</Li>
            <Li>Upload content that infringes someone else&apos;s rights, contains malware, or depicts minors inappropriately.</Li>
            <Li>Attempt to access other users&apos; accounts or our infrastructure beyond what&apos;s offered.</Li>
            <Li>Bypass rate limits, paywalls, or anti-abuse systems.</Li>
          </ul>
        </Section>

        <Section title="7. Your content">
          <p>
            You keep ownership of photos, notes, and trip data you upload (&quot;Your
            Content&quot;). You grant us a worldwide, non-exclusive, royalty-free license to
            host, store, reproduce, modify (for technical operation only — e.g., resizing
            images), and display Your Content as needed to operate the Service. If you
            choose to share content publicly (e.g., a public trip page), you grant the
            additional right needed to make it visible to the audience you choose.
          </p>
          <p>
            We can remove content that violates these Terms or applicable law. We don&apos;t
            actively moderate every upload but we respond to reports.
          </p>
        </Section>

        <Section title="8. Our content">
          <p>
            geknee, the geknee logo, the monument illustrations, the 3D models we created
            or commissioned, and the curated metadata are owned by us or our licensors and
            protected by copyright and trademark law. You get a personal, non-exclusive,
            non-transferable license to use them as part of the Service. Nothing else.
          </p>
        </Section>

        <Section title="9. AI-generated content">
          <p>
            geknee uses third-party large language models (currently Anthropic&apos;s Claude)
            to power trip suggestions and chat. AI output can be wrong, dated, or
            inappropriate. Verify anything important — flight times, visa rules, medical
            advice — with an authoritative source before relying on it. We&apos;re not liable
            for losses caused by following AI suggestions.
          </p>
        </Section>

        <Section title="10. Service changes and termination">
          <ul>
            <Li>We may add, change, or remove features at any time.</Li>
            <Li>We may suspend or terminate your account for violation of these Terms, fraud, or to comply with law. We&apos;ll notify you when reasonable.</Li>
            <Li>You can delete your account at any time in settings or by emailing us.</Li>
            <Li>On termination, we delete or anonymize your data per the Privacy Policy retention schedule.</Li>
          </ul>
        </Section>

        <Section title="11. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. We
            don&apos;t warrant that the Service will be uninterrupted, error-free, or that
            data will not be lost.
          </p>
        </Section>

        <Section title="12. Limitation of liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, geknee AND ITS OFFICERS, EMPLOYEES, AND
            AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL ARISING OUT OF
            OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM IS
            LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE
            THE CLAIM AROSE, OR (B) USD $100.
          </p>
        </Section>

        <Section title="13. Indemnification">
          <p>
            You agree to defend and indemnify geknee against any third-party claim arising
            from your misuse of the Service, your content, or your violation of these
            Terms or applicable law.
          </p>
        </Section>

        <Section title="14. Governing law and disputes">
          <p>
            These Terms are governed by the laws of {GOVERNING_LAW}, without regard to
            conflict-of-laws rules. Any dispute will be resolved in the state or federal
            courts located in {GOVERNING_LAW}, and you consent to that jurisdiction. Where
            your local law gives you stronger consumer rights, those rights apply.
          </p>
        </Section>

        <Section title="15. Apple-specific terms (iOS app)">
          <p>If you&apos;re using the iOS app:</p>
          <ul>
            <Li>These Terms are between you and geknee. Apple is not a party.</Li>
            <Li>Apple has no obligation to provide maintenance or support for the app.</Li>
            <Li>Apple is not responsible for any product warranties, claims, or refunds; those go through us. Refund inquiries for IAP purchases go through Apple per their policies.</Li>
            <Li>Apple is a third-party beneficiary of these Terms and may enforce them against you.</Li>
            <Li>You confirm you&apos;re not located in a country subject to U.S. embargo or designated as a &quot;terrorist supporting&quot; country, and you&apos;re not on any U.S. government prohibited or restricted parties list.</Li>
          </ul>
        </Section>

        <Section title="16. Changes to these Terms">
          <p>
            If we make material changes we&apos;ll notify you by email or in the app at least
            14 days before they take effect. Continued use after changes take effect
            counts as acceptance.
          </p>
        </Section>

        <Section title="17. Contact">
          <p>
            Questions? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT }}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <hr style={{ border: 0, borderTop: '1px solid rgba(0,0,0,0.1)', margin: '40px 0 20px' }} />
        <p style={{ fontSize: 12, color: '#666' }}>
          This document is a starting draft. Before you launch publicly or submit to the
          App Store, have a lawyer in your jurisdiction review it — especially the
          governing law, refund policy, IAP/IAP-revenue terms, and consumer-rights
          language.
        </p>
      </div>
    </main>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 22, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 8 }}>{children}</li>;
}
