// Welcome email sent to users immediately after a successful Stripe checkout.
// Body content matches the /pricing copy so the email is the same promise the
// user just paid for. Yearly tier surfaces the two extra perks (postcard + skin).
//
// Plain HTML — no React Email, no template engine. Resend renders it as-is.

type Args = {
  name: string | null;
  interval: 'monthly' | 'yearly';
};

export function renderProWelcomeEmail({ name, interval }: Args): string {
  const greeting = name ? `Hi ${escapeHtml(name.split(' ')[0])},` : 'Hi there,';
  const planLabel = interval === 'yearly' ? 'GeKnee Pro · Yearly' : 'GeKnee Pro · Monthly';

  const corePerks = [
    { title: 'Unlimited AI-planned trips', sub: 'No more 3/month cap — plan as many as you dream up.' },
    { title: 'Unlimited saved drafts', sub: 'Keep every itinerary on the shelf, even the wild ones.' },
    { title: 'Priority support · 12h response', sub: 'Email hello@geknee.com — we answer same day.' },
    { title: 'Early access to new monument skins', sub: 'You see new rarity tiers before they ship to free.' },
    { title: 'Pro-only rarity tiers', sub: 'Aurora, celestial, damascus — only Pro can unlock these.' },
  ];

  const yearlyExtras = interval === 'yearly' ? [
    { title: 'Exclusive Pro-Yearly monument skin', sub: 'A skin only yearly subscribers ever get to mint.' },
    { title: 'Annual collection postcard, printed', sub: 'Real card in real mail at the end of the year.' },
  ] : [];

  const perks = [...corePerks, ...yearlyExtras];

  const perksHtml = perks.map(p => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #2a2a45;">
        <div style="color:#f2f2f8;font-size:15px;font-weight:600;margin-bottom:4px;">${escapeHtml(p.title)}</div>
        <div style="color:#a8a8c0;font-size:13px;line-height:1.5;">${escapeHtml(p.sub)}</div>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Welcome to GeKnee Pro</title>
</head>
<body style="margin:0;padding:0;background:#05050f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#f2f2f8;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#05050f;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="540" style="max-width:540px;background:#0d0d24;border:1px solid rgba(167,139,250,0.18);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <div style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#a78bfa;letter-spacing:-0.01em;">geknee</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-weight:300;font-size:36px;line-height:1.1;letter-spacing:-0.02em;color:#f2f2f8;">
                You're <em style="color:#a78bfa;">Pro</em>.
              </h1>
              <p style="margin:0;color:#a8a8c0;font-size:15px;line-height:1.55;">
                ${greeting} thanks for upgrading to ${escapeHtml(planLabel)}. Everything below unlocks immediately on your account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a78bfa;margin-bottom:8px;">
                What unlocks
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                ${perksHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;" align="center">
              <a href="https://www.geknee.com/plan/location" style="display:inline-block;padding:14px 28px;background:#a78bfa;color:#05050f;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">
                Open the globe →
              </a>
              <div style="margin-top:14px;color:#6b6b85;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.14em;text-transform:uppercase;">
                Cancel anytime · Powered by Stripe
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;border-top:1px solid #2a2a45;color:#6b6b85;font-size:12px;line-height:1.5;">
              Questions? Just reply to this email — it lands in our inbox.
              <br />
              <span style="color:#4a4a60;">© 2026 geknee · hello@geknee.com</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
