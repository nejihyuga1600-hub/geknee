import type { DashboardSnapshot, ProviderResult } from './types';

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => `${n.toFixed(1)}%`;

function statusChip<T>(r: ProviderResult<T>, configuredColor = '#22c55e'): string {
  if (r.status === 'ok') return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-family:ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;background:${configuredColor}1a;color:${configuredColor};border:1px solid ${configuredColor}55">OK</span>`;
  if (r.status === 'unconfigured') return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-family:ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;background:#3f3f461a;color:#a1a1aa;border:1px solid #71717a">SETUP</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-family:ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;background:#ef44441a;color:#ef4444;border:1px solid #ef444455">ERROR</span>`;
}

function card(title: string, statusBadge: string, body: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;background:#0f1424;border:1px solid rgba(255,255,255,.08);border-radius:12px;">
    <tr><td style="padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="color:#a78bfa;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:700">${title}</span>
        ${statusBadge}
      </div>
      <div style="color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${body}</div>
    </td></tr>
  </table>`;
}

function unconfiguredBody<T>(r: ProviderResult<T>): string {
  if (r.status === 'unconfigured') {
    return `<div style="color:#94a3b8;font-size:12px;font-family:ui-monospace,monospace">missing: ${r.missing.join(', ')}</div>`;
  }
  if (r.status === 'error') {
    return `<div style="color:#fca5a5;font-size:12px;font-family:ui-monospace,monospace">${r.error}</div>`;
  }
  return '';
}

export function renderDigestHtml(snap: DashboardSnapshot): string {
  const dateLabel = new Date(snap.generatedAt).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const usersBody = snap.users.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtN(snap.users.data.total)}</div>
      <div style="font-size:11px;color:#34d399;margin-top:6px;font-family:ui-monospace,monospace">+${snap.users.data.newLast24h} today · +${snap.users.data.newLast7d} 7d · +${snap.users.data.newLast30d} 30d</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-family:ui-monospace,monospace">${snap.users.data.activeLast7d} active · ${snap.users.data.paid} paid (${snap.users.data.paidPct}%)</div>
    `
    : unconfiguredBody(snap.users);

  const revBody = snap.revenue.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtUsd(snap.revenue.data.mrrUsd)}<span style="font-size:14px;color:#94a3b8;font-family:ui-monospace,monospace;margin-left:8px">MRR</span></div>
      <div style="font-size:11px;color:#34d399;margin-top:6px;font-family:ui-monospace,monospace">today ${fmtUsd(snap.revenue.data.todayUsd)} · 7d ${fmtUsd(snap.revenue.data.last7dUsd)} · 30d ${fmtUsd(snap.revenue.data.last30dUsd)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-family:ui-monospace,monospace">${snap.revenue.data.paidSubsActive} subs · +${snap.revenue.data.newPaidLast7d} new · -${snap.revenue.data.cancelsLast7d} canceled (7d)</div>
    `
    : unconfiguredBody(snap.revenue);

  const folBody = snap.followers.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtN(snap.followers.data.total)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,monospace">${snap.followers.data.perPlatform.map((p) => `${p.platform.toUpperCase()} ${fmtN(p.followers)}${p.handle ? ` @${p.handle}` : ''}`).join(' · ')}</div>
    `
    : unconfiguredBody(snap.followers);

  const viewsBody = snap.socialViews.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtN(snap.socialViews.data.total7d)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,monospace">7d views · ${snap.socialViews.data.perPlatform.map((p) => `${p.platform.toUpperCase()} ${fmtN(p.views7d)}`).join(' · ')}</div>
    `
    : unconfiguredBody(snap.socialViews);

  const adBody = snap.adSpend.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtUsd(snap.adSpend.data.todayUsd)}<span style="font-size:14px;color:#94a3b8;font-family:ui-monospace,monospace;margin-left:8px">today</span></div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,monospace">7d ${fmtUsd(snap.adSpend.data.last7dUsd)}</div>
      ${snap.adSpend.data.perPlatform.map((p) => `<div style="font-size:11px;color:#94a3b8;margin-top:2px;font-family:ui-monospace,monospace">${p.platform.toUpperCase()} · today ${fmtUsd(p.todayUsd)} · ${p.activeCampaigns} active</div>`).join('')}
    `
    : unconfiguredBody(snap.adSpend);

  const prodBody = snap.product.status === 'ok'
    ? `
      <div style="font-size:11px;color:#94a3b8;font-family:ui-monospace,monospace;margin-bottom:6px">PRODUCT</div>
      <div style="font-size:13px;color:#f1f5f9;font-family:ui-monospace,monospace;line-height:1.7">
        Trips total: <b>${fmtN(snap.product.data.tripsTotal)}</b><br>
        New trips 7d: <b>${fmtN(snap.product.data.tripsLast7d)}</b><br>
        Itineraries 7d: <b>${fmtN(snap.product.data.itinerariesGeneratedLast7d)}</b><br>
        Agent tokens 7d: <b>${fmtN(snap.product.data.agentTokensLast7d)}</b> (~${fmtUsd(snap.product.data.agentCostUsdLast7d)})<br>
      </div>
      ${snap.product.data.topLocationsLast7d.length ? `
        <div style="font-size:11px;color:#94a3b8;font-family:ui-monospace,monospace;margin-top:10px;margin-bottom:4px">TOP LOCATIONS 7D</div>
        <div style="font-size:12px;color:#f1f5f9;font-family:ui-monospace,monospace">
          ${snap.product.data.topLocationsLast7d.map((l, i) => `<div style="margin-top:2px">${i + 1}. ${l.location} <span style="color:#94a3b8">×${l.count}</span></div>`).join('')}
        </div>` : ''}
    `
    : unconfiguredBody(snap.product);

  const phBody = snap.posthog.status === 'ok'
    ? `
      <div style="font-size:36px;font-weight:800;font-family:Georgia,serif;line-height:1">${fmtN(snap.posthog.data.uniqueVisitorsLast7d)}<span style="font-size:14px;color:#94a3b8;font-family:ui-monospace,monospace;margin-left:8px">visitors 7d</span></div>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,monospace">${fmtN(snap.posthog.data.pageviewsLast7d)} pageviews · signup ${pct(snap.posthog.data.signupConversionPct)} · paid ${pct(snap.posthog.data.paidConversionPct)}</div>
      ${snap.posthog.data.topReferrers.length ? `
        <div style="font-size:11px;color:#94a3b8;font-family:ui-monospace,monospace;margin-top:10px;margin-bottom:4px">TOP REFERRERS</div>
        ${snap.posthog.data.topReferrers.map((r) => `<div style="font-size:12px;color:#f1f5f9;font-family:ui-monospace,monospace;margin-top:2px">${r.referrer} <span style="color:#94a3b8">${fmtN(r.visits)}</span></div>`).join('')}` : ''}
    `
    : unconfiguredBody(snap.posthog);

  return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0f1e">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a0f1e">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%">
        <tr><td>
          <div style="color:#a78bfa;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;margin-bottom:4px">geknee · mission control</div>
          <div style="color:#f1f5f9;font-family:Georgia,serif;font-size:22px;font-weight:700;margin-bottom:18px">${dateLabel}</div>

          ${card('USERS', statusChip(snap.users), usersBody)}
          ${card('REVENUE', statusChip(snap.revenue), revBody)}
          ${card('SOCIAL FOLLOWERS', statusChip(snap.followers), folBody)}
          ${card('SOCIAL VIEWS · 7D', statusChip(snap.socialViews), viewsBody)}
          ${card('AD SPEND', statusChip(snap.adSpend), adBody)}
          ${card('PRODUCT', statusChip(snap.product), prodBody)}
          ${card('POSTHOG', statusChip(snap.posthog), phBody)}

          <div style="color:#64748b;font-family:ui-monospace,monospace;font-size:10px;text-align:center;margin-top:18px">snapshot ${snap.generatedAt}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
