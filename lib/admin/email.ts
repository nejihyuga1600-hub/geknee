// Resend HTTP client. Direct fetch instead of the SDK to avoid a new dep.
// Doc: https://resend.com/docs/api-reference/emails/send-email
export async function sendEmail(opts: { to: string | string[]; subject: string; html: string; from?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY missing');
  const from = opts.from ?? process.env.DIGEST_FROM ?? 'geknee dashboard <dashboard@geknee.com>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}
