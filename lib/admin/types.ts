// Shared types for the geknee admin dashboard. Every provider returns the
// same envelope so the UI can render a uniform "configured / missing /
// error" state per card without special-casing each integration.

export type ProviderStatus = 'ok' | 'unconfigured' | 'error';

export type ProviderResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unconfigured'; missing: string[] }
  | { status: 'error'; error: string };

export interface UsersStats {
  total: number;
  newLast24h: number;
  newLast7d: number;
  newLast30d: number;
  paid: number;
  paidPct: number;
  activeLast7d: number;        // users with lastSeen in last 7d
  spark7d: number[];           // signups per day, last 7 days (oldest first)
}

export interface RevenueStats {
  mrrUsd: number;
  arrUsd: number;
  todayUsd: number;
  last7dUsd: number;
  last30dUsd: number;
  paidSubsActive: number;
  newPaidLast7d: number;
  cancelsLast7d: number;
}

export interface SocialFollowers {
  total: number;
  perPlatform: { platform: 'instagram' | 'tiktok'; followers: number; handle?: string }[];
  totalLast7dDelta: number | null;
}

export interface SocialViews {
  total7d: number;
  perPlatform: { platform: 'instagram' | 'tiktok'; views7d: number }[];
}

export interface AdSpendStats {
  todayUsd: number;
  last7dUsd: number;
  last30dUsd: number;
  perPlatform: { platform: 'meta' | 'google' | 'tiktok'; todayUsd: number; last7dUsd: number; activeCampaigns: number }[];
}

export interface ProductStats {
  tripsTotal: number;
  tripsLast7d: number;
  itinerariesGeneratedLast7d: number;
  agentTokensLast7d: number;
  agentCostUsdLast7d: number;
  topLocationsLast7d: { location: string; count: number }[];
}

export interface PosthogStats {
  uniqueVisitorsLast7d: number;
  pageviewsLast7d: number;
  signupConversionPct: number; // visitors → signups (last 7d)
  paidConversionPct: number;   // signups → paid (last 7d)
  topReferrers: { referrer: string; visits: number }[];
}

export interface DashboardSnapshot {
  generatedAt: string;
  users: ProviderResult<UsersStats>;
  revenue: ProviderResult<RevenueStats>;
  followers: ProviderResult<SocialFollowers>;
  socialViews: ProviderResult<SocialViews>;
  adSpend: ProviderResult<AdSpendStats>;
  product: ProviderResult<ProductStats>;
  posthog: ProviderResult<PosthogStats>;
}
