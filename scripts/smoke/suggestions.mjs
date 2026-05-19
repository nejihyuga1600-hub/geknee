// scripts/smoke/suggestions.mjs
// Exercises the prompt builder and the JSON validator without hitting Claude
// or the DB. Run: npx tsx scripts/smoke/suggestions.mjs

import { buildUserPrompt, SUGGESTION_SYSTEM_PROMPT } from '../../lib/suggestions/prompt.ts';
import { parseAndValidate } from '../../lib/suggestions/validate.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('PASS:', msg);
}

const prompt = buildUserPrompt({
  trip: { id: 't1', title: 'Paris weekend', location: 'Paris', startDate: '2026-06-01', endDate: '2026-06-04', itinerary: 'Day 1: Louvre\nDay 2: Eiffel' },
  messages: [{ id: 'm1', author: 'Sarah', content: 'we are impressionism people', createdAt: new Date() }],
  history: [{ status: 'rejected', kind: 'activity_swap', dayNumber: 1, summary: 'Swap Louvre for Versailles', votesUpCount: 0, votesDownCount: 3, alternatives: [{ author: 'mike', text: 'no daytrips' }] }],
});
assert(prompt.includes('Paris weekend'), 'prompt contains trip title');
assert(prompt.includes('[m1] Sarah'), 'prompt cites message id');
assert(prompt.includes('alt @mike'), 'prompt includes prior alternatives');
assert(SUGGESTION_SYSTEM_PROMPT.includes('STRICT JSON'), 'system prompt enforces JSON');

const goodJson = JSON.stringify({ suggestions: [{
  kind: 'activity_swap', dayNumber: 1,
  summary: "Replace Louvre with Musee d'Orsay",
  rationale: 'Sarah said impressionism, Mike +1ed Orsay',
  payload: { dayNumber: 1, newActivity: "Visit Musee d'Orsay" },
  basedOnMessageIds: ['m1'],
}] });
const v1 = parseAndValidate(goodJson);
assert(v1.length === 1, 'valid suggestion passes');

const fencedJson = '```json\n' + goodJson + '\n```';
const v2 = parseAndValidate(fencedJson);
assert(v2.length === 1, 'fenced JSON parses');

const badKind = JSON.stringify({ suggestions: [{ ...JSON.parse(goodJson).suggestions[0], kind: 'invalid' }] });
const v3 = parseAndValidate(badKind);
assert(v3.length === 0, 'invalid kind dropped');

const missingProvenance = JSON.stringify({ suggestions: [{ ...JSON.parse(goodJson).suggestions[0], basedOnMessageIds: [] }] });
const v4 = parseAndValidate(missingProvenance);
assert(v4.length === 0, 'missing provenance dropped');

const garbage = parseAndValidate('not json at all');
assert(garbage.length === 0, 'garbage returns empty list');

console.log('\nAll suggestion smoke checks passed.');
