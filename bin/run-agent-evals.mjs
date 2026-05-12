#!/usr/bin/env node
// Agent eval runner. In-process: instantiates the same runAgent the
// /api/agent endpoint uses, but skips auth + DB-bound tools so cases
// run without network round-trips back to ourselves.
//
//   bun run bin/run-agent-evals.mjs                     # all cases
//   bun run bin/run-agent-evals.mjs paris-weekend-veg   # one case
//
// Outputs a markdown report to evals/agent/last-run.md and prints a
// short summary to stdout. Non-zero exit if average pass rate < 0.85.
//
// Requires the same env vars as /api/agent: ANTHROPIC_API_KEY plus
// whatever each tool needs (GOOGLE_MAPS_API_KEY, MAPBOX_TOKEN,
// OPENWEATHER_API_KEY, TRAVELPAYOUTS_TOKEN, GOOGLE_PLACES_API_KEY).
// Pull them with `vercel env pull .env.eval` then `source` it before
// running, or run via `dotenv -e .env.eval -- bun ...`.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Use tsx-style imports via Next.js's TS resolution. We run via bun, which
// transpiles TypeScript on the fly.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const { CASES } = await import(join(ROOT, 'evals/agent/cases.ts'));
const { scoreCase, summarize } = await import(join(ROOT, 'evals/agent/scorer.ts'));
const { judgeNarrative } = await import(join(ROOT, 'evals/agent/judge.ts'));
const { runAgent } = await import(join(ROOT, 'lib/agent/loop.ts'));
// Use a slimmed tools list — recall_user_context needs Prisma which the
// runner doesn't bootstrap. The eval cases inline any user context
// directly into the prompt.
const { geocodeTool } = await import(join(ROOT, 'lib/agent/tools/geocode.ts'));
const { routeBetweenTool } = await import(join(ROOT, 'lib/agent/tools/route_between.ts'));
const { weatherForecastTool } = await import(join(ROOT, 'lib/agent/tools/weather_forecast.ts'));
const { findPlacesTool } = await import(join(ROOT, 'lib/agent/tools/find_places.ts'));
const { flightSearchTool } = await import(join(ROOT, 'lib/agent/tools/flight_search.ts'));
const { currencyConvertTool } = await import(join(ROOT, 'lib/agent/tools/currency_convert.ts'));
const { echoTool } = await import(join(ROOT, 'lib/agent/tools/echo.ts'));

const SYSTEM_PROMPT = `You are geknee's travel-planning agent (eval mode). Plan trips by gathering real facts with tools BEFORE writing prose. Always: (1) geocode the trip city, (2) find_places for any restaurant or business you name, (3) route_between consecutive stops, (4) weather_forecast for trips within 14 days, (5) flight_search when budget or date flexibility is mentioned. Output a markdown itinerary with bold place names, transit emojis (🚶/🚲/🚕/🚇) on every leg, and durations from route_between. Honor any dietary restrictions in the prompt strictly. Never call the echo tool.`;

const onlyId = process.argv[2];
const cases = onlyId ? CASES.filter((c) => c.id === onlyId) : CASES;
if (!cases.length) {
  console.error(`No matching case for "${onlyId}". Available:`);
  for (const c of CASES) console.error(`  - ${c.id}`);
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set. Pull env: `vercel env pull .env`');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const tools = [
  geocodeTool,
  routeBetweenTool,
  findPlacesTool,
  weatherForecastTool,
  flightSearchTool,
  currencyConvertTool,
  echoTool,
];

const scores = [];
for (const c of cases) {
  process.stdout.write(`\n▶ ${c.id} … `);
  const events = [];
  const t0 = Date.now();
  try {
    await runAgent({
      client,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: c.prompt,
      tools,
      ctx: { userId: 'eval-runner' },
      onEvent: (e) => {
        events.push(e);
      },
    });
  } catch (err) {
    console.error(`error: ${err.message}`);
  }
  const elapsedMs = Date.now() - t0;
  const score = scoreCase(c, events);

  if (process.env.AGENT_EVAL_LLM_JUDGE === 'true' && score.output.length > 0) {
    try {
      const verdict = await judgeNarrative(client, c, score.output);
      score.judgeScore = verdict.score;
      score.judgeReason = verdict.reason;
    } catch (err) {
      console.error(`  judge error: ${err.message}`);
    }
  }

  scores.push(score);
  const judgeStr = score.judgeScore ? ` · judge ${score.judgeScore}/5` : '';
  console.log(`${score.pass ? 'PASS' : 'FAIL'} ${(score.passRate * 100).toFixed(0)}% (${(elapsedMs / 1000).toFixed(1)}s, ${score.usage.inputTokens.toLocaleString()}in/${score.usage.outputTokens.toLocaleString()}out${judgeStr})`);
}

const report = summarize(scores);
const reportPath = join(ROOT, 'evals/agent/last-run.md');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report, 'utf8');

const passing = scores.filter((s) => s.pass).length;
const avgPassRate = scores.reduce((a, s) => a + s.passRate, 0) / Math.max(1, scores.length);
console.log(`\n${'='.repeat(56)}`);
console.log(`${passing}/${scores.length} cases all-rules-pass • avg pass rate ${(avgPassRate * 100).toFixed(1)}%`);
console.log(`Report written to ${reportPath}`);
process.exit(avgPassRate >= 0.85 ? 0 : 1);
