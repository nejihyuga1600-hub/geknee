import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy · geknee',
  description: 'How geknee collects, uses, and protects your data.',
};

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';

const LAST_UPDATED = 'May 7, 2026';
const CONTACT_EMAIL = 'privacy@geknee.com';
const ENTITY = 'geknee'; // update with legal entity name once incorporated

export default function PrivacyPage() {
  return (
    <main style={{ background: PAPER, color: INK, minHeight: '100vh', padding: '48px 20px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'var(--font-ui), system-ui, sans-serif', lineHeight: 1.6 }}>
        <Link href="/" style={{ color: ACCENT, fontSize: 13, textDecoration: 'none' }}>← geknee</Link>
        <h1 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 40, margin: '24px 0 8px' }}>Privacy Policy</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 40 }}>Last updated: {LAST_UPDATED}</p>

        <p>
          This Privacy Policy explains what information {ENTITY} (&quot;geknee&quot;, &quot;we&quot;,
          &quot;us&quot;) collects when you use our website, mobile apps, and services
          (collectively, the &quot;Service&quot;), how we use it, and the choices you have.
          It is intended to be read alongside our <Link href="/terms" style={{ color: ACCENT }}>Terms of Service</Link>.
        </p>

        <Section title="1. Information we collect">
          <H3>Information you give us</H3>
          <ul>
            <Li><b>Account data:</b> your email address, display name, profile photo if you choose to add one, and a hashed password (or your OAuth identifier if you sign in with Google or Apple).</Li>
            <Li><b>Trip and travel data:</b> destinations you plan, dates, travel style preferences, and any notes you save.</Li>
            <Li><b>Payment data:</b> handled by our payment processor (Stripe); we do not store full card numbers on our servers. We retain a token, the last four digits of your card, the country, and transaction history.</Li>
            <Li><b>Communications:</b> support emails or messages you send us.</Li>
          </ul>

          <H3>Information collected automatically</H3>
          <ul>
            <Li><b>Location data:</b> when you check in to a monument, we capture your device&apos;s GPS coordinates and the timestamp to verify proof of presence. You can decline this permission, but check-ins won&apos;t work without it.</Li>
            <Li><b>Photos:</b> when you take a photo for a monument check-in, the image and its EXIF metadata (timestamp, GPS) are uploaded to our blob storage. Photos are tied to your account and visible only to you unless you explicitly share them.</Li>
            <Li><b>Device + usage data:</b> IP address, browser/OS version, screen size, language, pages visited, and approximate session duration. Used for analytics and abuse prevention.</Li>
            <Li><b>Session recordings:</b> we use PostHog to record anonymized session replays of how the app is used (clicks, scrolls, navigation). All form inputs are masked by default. We use this only to debug UX issues and improve the product.</Li>
            <Li><b>Error reports:</b> when the app crashes, we send the error details (stack trace, browser info, current URL) to Sentry. No personal data is included unless it appears in a URL or error message.</Li>
            <Li><b>Cookies:</b> we use a small number of cookies for authentication, language preference, and analytics. See <a href="#cookies" style={{ color: ACCENT }}>Section 8</a>.</Li>
          </ul>
        </Section>

        <Section title="2. How we use your information">
          <ul>
            <Li>To run the Service: authenticate you, save your trips, verify monument check-ins, process payments.</Li>
            <Li>To send transactional emails: receipts, password resets, security alerts. We don&apos;t send marketing emails without your opt-in.</Li>
            <Li>To send push notifications you opted into: trip reminders, deal alerts, monument unlock confirmations. You can disable these anytime in your device settings.</Li>
            <Li>To improve the product: aggregate analytics, debug crashes, A/B test new features.</Li>
            <Li>To prevent fraud and abuse: rate-limit suspicious traffic, detect fake check-ins, block accounts that violate our Terms.</Li>
            <Li>To comply with legal obligations: respond to lawful subpoenas, tax reporting on commission revenue, etc.</Li>
          </ul>
        </Section>

        <Section title="3. Who we share your information with">
          <p>We don&apos;t sell your personal information. We share data only with vendors who help us run the Service, and only to the extent needed:</p>
          <ul>
            <Li><b>Stripe</b> — payment processing. Subject to Stripe&apos;s privacy policy.</Li>
            <Li><b>Anthropic (Claude)</b> — powers the AI trip-planning chat. Trip prompts are sent to Anthropic&apos;s API per their data-use terms; we configure zero-retention where available.</Li>
            <Li><b>Google Maps Platform</b> — map tiles, places autocomplete, geocoding, and directions across the planner UI.</Li>
            <Li><b>Vercel</b> — hosting, analytics (Speed Insights, Web Analytics), and edge infrastructure.</Li>
            <Li><b>PostHog</b> — product analytics and session replay (with input masking).</Li>
            <Li><b>Sentry</b> — error and performance monitoring.</Li>
            <Li><b>Travel partners (Booking.com, Expedia, airline booking aggregators, Travelpayouts)</b> — when you click through to book a hotel, flight, or activity, you&apos;re leaving geknee. Their privacy practices apply to your booking. We may receive a commission record (anonymized booking ID, amount) for accounting.</Li>
            <Li><b>Authentication providers</b> (Google, Apple, etc.) — only if you sign in with them.</Li>
            <Li><b>Push notification services</b> — Apple Push Notification service (APNs) on iOS, Firebase Cloud Messaging (FCM) on Android.</Li>
            <Li><b>Law enforcement</b> — if compelled by valid legal process or to protect rights, safety, or property.</Li>
          </ul>
        </Section>

        <Section title="4. Where your data lives">
          <p>
            geknee is hosted on Vercel infrastructure, primarily in U.S. data centers. If
            you access the Service from outside the U.S., your data will be transferred to
            and processed in the U.S. We rely on Standard Contractual Clauses for transfers
            from the EEA, UK, and Switzerland.
          </p>
        </Section>

        <Section title="5. How long we keep your data">
          <ul>
            <Li>Account data: as long as your account is active, plus up to 30 days after deletion to satisfy backup rotation and audit logs.</Li>
            <Li>Trip and check-in data: same lifecycle as your account, unless you delete individual trips.</Li>
            <Li>Payment records: retained 7 years for tax compliance.</Li>
            <Li>Anonymized analytics: indefinitely, in aggregate form only.</Li>
            <Li>Error logs: 90 days in Sentry, then purged.</Li>
            <Li>Session recordings: 30 days in PostHog, then purged.</Li>
          </ul>
        </Section>

        <Section title="6. Your rights">
          <p>Depending on where you live (notably under GDPR, UK GDPR, CCPA, and similar laws), you have the right to:</p>
          <ul>
            <Li>Access the data we have about you.</Li>
            <Li>Correct inaccurate data.</Li>
            <Li>Delete your data (we&apos;ll delete unless we&apos;re legally required to retain it).</Li>
            <Li>Export a copy of your data in a portable format.</Li>
            <Li>Object to or restrict certain processing.</Li>
            <Li>Withdraw consent for optional processing (analytics, marketing).</Li>
            <Li>Lodge a complaint with your local data-protection authority.</Li>
          </ul>
          <p>To exercise any right, email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT }}>{CONTACT_EMAIL}</a>. We respond within 30 days.</p>
        </Section>

        <Section title="7. Children">
          <p>
            geknee is not directed to children under 13 (or under 16 in the EEA/UK). We
            don&apos;t knowingly collect data from children. If you believe a child has given
            us their data, contact us and we&apos;ll delete it.
          </p>
        </Section>

        <Section title="8. Cookies and tracking" id="cookies">
          <ul>
            <Li><b>Essential cookies:</b> session token, CSRF protection, language preference. These are required for the Service to work.</Li>
            <Li><b>Analytics cookies:</b> PostHog and Vercel Analytics. These can be disabled by enabling Do Not Track or via our cookie banner where required.</Li>
            <Li>We do not run third-party advertising trackers.</Li>
          </ul>
        </Section>

        <Section title="9. Security">
          <p>
            We use HTTPS for all traffic, hash passwords with bcrypt, store payment info via
            Stripe&apos;s PCI-DSS environment, restrict employee access on a need-to-know
            basis, and follow standard cloud security practices. No system is perfectly
            secure; if we discover a breach affecting your data we&apos;ll notify you and the
            relevant authorities promptly.
          </p>
        </Section>

        <Section title="10. Changes to this Policy">
          <p>
            If we make material changes we&apos;ll notify you by email and post a notice in the
            app at least 14 days before the change takes effect. The &quot;Last updated&quot; date
            at the top reflects the current version.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about privacy? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT }}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>
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

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 15, margin: '20px 0 8px', fontWeight: 700 }}>{children}</h3>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: 8 }}>{children}</li>;
}
