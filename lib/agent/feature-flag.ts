// Parallel-rollout gate for the new tool-using planning agent.
//
//   AGENT_ENABLED=true                     → on for every signed-in user
//   AGENT_USER_ALLOWLIST=user1,user2       → on for these userIds only
//
// Both unset → endpoint returns 403. This lets us ship the agent code
// to production without exposing it to real traffic until a small
// allowlist (e.g. internal test users) confirms parity with the
// existing /api/itinerary endpoint.
export function isAgentEnabledFor(userId: string): boolean {
  if (process.env.AGENT_ENABLED === 'true') return true;
  const allow = (process.env.AGENT_USER_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(userId);
}
