// lib/suggestions/threshold.ts
// Pure function: do the votes on this suggestion satisfy the auto-apply rule?
// Rule: at least 2 voters AND >50% are 👍. Returns `false` for trip_field kind
// (owner-only even in auto_majority mode, per the spec guardrail).

export const AUTO_APPLY_WINDOW_MS = 60_000;
export const MIN_VOTERS_FOR_AUTO = 2;

export function shouldAutoApply(
  kind: string,
  votesUpCount: number,
  votesDownCount: number,
): boolean {
  if (kind === 'trip_field') return false;
  const total = votesUpCount + votesDownCount;
  if (total < MIN_VOTERS_FOR_AUTO) return false;
  return votesUpCount / total > 0.5;
}
