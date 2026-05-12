// "Issue" rollover policy for geknee passport.
//
// An Issue corresponds to one calendar year — Issue 2026 = trips collected
// in 2026. We don't roll the active issue at midnight on Jan 1, because
// that would amputate Dec 26 → Dec 31 trips (the most-photographed week
// of the year) into a "next year" bucket where users wouldn't think to
// look for them.
//
// Instead we extend the active issue until Jan 15. Between Jan 1–14, the
// "current" issue is still last year — users see / collect into year Y
// while the actual calendar is in year Y+1. On Jan 15 the cutover happens
// — Issue Y is archived (still viewable at ?year=Y), and Issue Y+1
// becomes the active collectible passport.
//
// Why Jan 15: it falls inside the global travel trough (post-New Year
// return travel ends ~Jan 7, Lunar New Year surge starts ~Jan 21).
// Cutting over in the trough means the *least* active user is the one
// losing the *least* by the reset.

const ROLLOVER_MONTH = 0; // January (0-indexed)
const ROLLOVER_DAY = 15;  // Roll over on the 15th — global travel trough

/**
 * The year currently being collected toward. Between Jan 1 and Jan 14 of
 * year Y+1, this returns Y — i.e. the prior year's issue is still the
 * active issue. On Jan 15 of year Y+1, this returns Y+1.
 *
 * All comparisons in UTC so the rollover happens at the same instant
 * worldwide regardless of the user's timezone.
 */
export function currentIssueYear(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (m < ROLLOVER_MONTH || (m === ROLLOVER_MONTH && d < ROLLOVER_DAY)) {
    return y - 1;
  }
  return y;
}

/**
 * Whether we're currently in the "wrap-up window" — the period between
 * Dec 1 and Jan 14 inclusive, when the active issue is winding down and
 * users should see the year-in-review CTA prominently.
 */
export function isWrapUpWindow(now: Date = new Date()): boolean {
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (m === 11) return d >= 1;           // Dec 1 onward
  if (m === 0 && d < ROLLOVER_DAY) return true; // Jan 1 – Jan 14
  return false;
}

/**
 * The next rollover date (Jan 15 of the calendar year *after* the current
 * issue year). Used for "Issue closes on …" copy.
 */
export function nextRolloverDate(now: Date = new Date()): Date {
  const issueY = currentIssueYear(now);
  return new Date(Date.UTC(issueY + 1, ROLLOVER_MONTH, ROLLOVER_DAY));
}
