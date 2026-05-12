// Mechanical scorer for the agent eval harness.
//
// Pure functions only — no I/O. The runner feeds a captured event log
// + the case spec, and we return a score breakdown with pass/fail per
// rule. New rules added here. Avoid LLM-based scoring: we want eval
// runs to be deterministic, fast, and free.

import type { EvalCase } from './cases';
import type { AgentEvent } from '@/lib/agent/loop';

export interface RuleResult {
  rule: string;
  pass: boolean;
  detail?: string;
}

export interface CaseScore {
  caseId: string;
  rules: RuleResult[];
  pass: boolean;
  passRate: number;
  output: string;
  toolCalls: { name: string; input: unknown }[];
  usage: { inputTokens: number; outputTokens: number };
}

interface CaseTrace {
  events: AgentEvent[];
  text: string;
  toolCalls: { name: string; input: unknown }[];
  usage: { inputTokens: number; outputTokens: number };
}

export function traceFromEvents(events: AgentEvent[]): CaseTrace {
  let text = '';
  const toolCalls: { name: string; input: unknown }[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (const e of events) {
    if (e.type === 'text') text += e.delta;
    else if (e.type === 'tool_call') toolCalls.push({ name: e.name, input: e.input });
    else if (e.type === 'usage') {
      usage.inputTokens += e.inputTokens;
      usage.outputTokens += e.outputTokens;
    }
  }
  return { events, text, toolCalls, usage };
}

export function scoreCase(c: EvalCase, events: AgentEvent[]): CaseScore {
  const trace = traceFromEvents(events);
  const rules: RuleResult[] = [];

  // Rule 1: produced a multi-day markdown itinerary
  const dayHeaders = (trace.text.match(/(?:^|\n)#{1,3}?\s*Day\s*\d+/gi) ?? []).length;
  rules.push({
    rule: 'has_day_headers',
    pass: dayHeaders >= Math.max(1, c.expectedDays - 1),
    detail: `found ${dayHeaders} day headers, expected ~${c.expectedDays}`,
  });

  // Rule 2: each day plan has transit emojis (🚶/🚲/🚕/🚇)
  const transitEmojiHits = (trace.text.match(/[\u{1F6B6}\u{1F6B2}\u{1F695}\u{1F687}]/gu) ?? []).length;
  rules.push({
    rule: 'has_transit_emojis',
    pass: transitEmojiHits >= Math.max(2, c.expectedDays),
    detail: `found ${transitEmojiHits} transit emojis`,
  });

  // Rule 3: bold place names appear in markdown (**Place**)
  const boldPlaces = (trace.text.match(/\*\*[^*\n]{2,60}\*\*/g) ?? []).length;
  rules.push({
    rule: 'has_bold_place_names',
    pass: boldPlaces >= 3,
    detail: `${boldPlaces} bold runs`,
  });

  // Rule 4: city was geocoded (no hallucinated coords)
  const geocodedTheCity = trace.toolCalls.some(
    (tc) =>
      tc.name === 'geocode' &&
      typeof (tc.input as { query?: string }).query === 'string' &&
      (tc.input as { query: string }).query.toLowerCase().includes(c.expectedCity.toLowerCase()),
  );
  rules.push({
    rule: 'geocoded_anchor_city',
    pass: geocodedTheCity,
    detail: geocodedTheCity ? `geocoded ${c.expectedCity}` : 'never geocoded the trip city',
  });

  // Rule 5: at least one find_places call (no inventing restaurants)
  const findPlacesCalls = trace.toolCalls.filter((tc) => tc.name === 'find_places').length;
  rules.push({
    rule: 'used_find_places',
    pass: findPlacesCalls >= 1,
    detail: `${findPlacesCalls} find_places calls`,
  });

  // Rule 6: dietary term mentioned in output if specified
  if (c.dietaryTerm) {
    const mentions = (trace.text.toLowerCase().match(new RegExp(c.dietaryTerm.toLowerCase(), 'g')) ?? []).length;
    rules.push({
      rule: 'dietary_term_acknowledged',
      pass: mentions >= 1,
      detail: `"${c.dietaryTerm}" appears ${mentions} times`,
    });
  }

  // Rule 7: flight_search called when prompt asks about price/flexibility
  if (c.expectsFlightSearch) {
    const flightCalls = trace.toolCalls.filter((tc) => tc.name === 'flight_search').length;
    rules.push({
      rule: 'used_flight_search',
      pass: flightCalls >= 1,
      detail: `${flightCalls} flight_search calls`,
    });
  }

  // Rule 8: output length plausible
  const len = trace.text.length;
  const minLen = 500;
  const maxLen = 12000;
  rules.push({
    rule: 'output_length_reasonable',
    pass: len >= minLen && len <= maxLen,
    detail: `${len} chars (${minLen}–${maxLen})`,
  });

  // Rule 9: no diagnostic echo tool was called
  const calledEcho = trace.toolCalls.some((tc) => tc.name === 'echo');
  rules.push({
    rule: 'did_not_call_diagnostic_echo',
    pass: !calledEcho,
    detail: calledEcho ? 'agent called echo (should never)' : 'clean',
  });

  const passes = rules.filter((r) => r.pass).length;
  return {
    caseId: c.id,
    rules,
    pass: passes === rules.length,
    passRate: passes / rules.length,
    output: trace.text,
    toolCalls: trace.toolCalls,
    usage: trace.usage,
  };
}

export function summarize(scores: CaseScore[]): string {
  const total = scores.length;
  const passing = scores.filter((s) => s.pass).length;
  const avgPassRate = scores.reduce((a, s) => a + s.passRate, 0) / Math.max(1, total);
  const totalIn = scores.reduce((a, s) => a + s.usage.inputTokens, 0);
  const totalOut = scores.reduce((a, s) => a + s.usage.outputTokens, 0);

  const lines: string[] = [];
  lines.push(`# Agent Eval Report`);
  lines.push('');
  lines.push(`- **Cases:** ${total}`);
  lines.push(`- **Passing (all rules):** ${passing}/${total}`);
  lines.push(`- **Average pass rate:** ${(avgPassRate * 100).toFixed(1)}%`);
  lines.push(`- **Tokens (in/out):** ${totalIn.toLocaleString()} / ${totalOut.toLocaleString()}`);
  lines.push('');
  lines.push(`## Per-case`);
  for (const s of scores) {
    const failed = s.rules.filter((r) => !r.pass);
    lines.push('');
    lines.push(`### ${s.caseId} — ${s.pass ? 'PASS' : 'FAIL'} (${(s.passRate * 100).toFixed(0)}%)`);
    lines.push(`- tokens: ${s.usage.inputTokens.toLocaleString()} in / ${s.usage.outputTokens.toLocaleString()} out`);
    lines.push(`- tool calls: ${s.toolCalls.length} (${s.toolCalls.map((t) => t.name).join(', ')})`);
    if (failed.length) {
      lines.push(`- **failed rules:**`);
      for (const r of failed) {
        lines.push(`  - ❌ \`${r.rule}\` — ${r.detail}`);
      }
    } else {
      lines.push(`- all rules passed`);
    }
  }
  return lines.join('\n');
}
