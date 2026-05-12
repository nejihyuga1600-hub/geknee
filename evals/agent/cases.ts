// Golden trip specs for the agent eval harness.
//
// Each case feeds a single user prompt to /api/agent (run in-process,
// no auth). The eval runner captures every event the agent emits, then
// the scorer in scorer.ts checks the output against the case's
// expectations. New cases land here. Keep them small, focused, and
// deterministic in their expectations — "must mention vegan" is fine,
// "must recommend X restaurant" is too brittle (Google Places shifts).

export interface EvalCase {
  id: string;
  prompt: string;
  // The trip's anchor city. Used by the geocode_called check — the
  // agent must successfully geocode this exact place.
  expectedCity: string;
  // Approximate number of days the agent should plan for. Used as a
  // sanity-check on output length, not a hard match.
  expectedDays: number;
  // Optional dietary tag the prompt mentions. The output must reference
  // this term (or a synonym) somewhere if set.
  dietaryTerm?: string;
  // Optional: the prompt mentions budget / flexibility, so the agent
  // should call flight_search at least once.
  expectsFlightSearch?: boolean;
}

export const CASES: EvalCase[] = [
  {
    id: 'paris-weekend-vegetarian',
    prompt:
      "Plan a 2-day weekend trip to Paris for a vegetarian. Mid-range budget, art and food focus. Walking-friendly. Don't recommend any restaurants without vegetarian options.",
    expectedCity: 'Paris',
    expectedDays: 2,
    dietaryTerm: 'vegetarian',
  },
  {
    id: 'tokyo-budget-flex-dates',
    prompt:
      "I want to visit Tokyo for 5 days in August 2026 if it's cheap to fly there from JFK. Help me plan the trip and tell me which week is cheapest. Standard non-vegetarian eater.",
    expectedCity: 'Tokyo',
    expectedDays: 5,
    expectsFlightSearch: true,
  },
  {
    id: 'rome-3day-classic',
    prompt:
      'Three days in Rome — classic sights, one museum per day, dinner at a real local trattoria each night. No fixed dietary restrictions.',
    expectedCity: 'Rome',
    expectedDays: 3,
  },
  {
    id: 'bali-wellness-vegan',
    prompt:
      'Plan a quiet 4-day wellness trip to Bali. I am vegan. Yoga in the mornings, beach in the afternoons. Avoid party scenes.',
    expectedCity: 'Bali',
    expectedDays: 4,
    dietaryTerm: 'vegan',
  },
  {
    id: 'nyc-food-crawl',
    prompt:
      'Two days in New York focused entirely on food. Hit one neighborhood per day. Cheap eats and one nice dinner. Walking and subway only.',
    expectedCity: 'New York',
    expectedDays: 2,
  },
];
