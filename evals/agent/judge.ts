// LLM-as-judge for narrative quality. Optional (gated on
// AGENT_EVAL_LLM_JUDGE=true) because it adds ~$0.01-0.02 per case.
// Mechanical scorer in scorer.ts catches structural regressions; the
// judge catches subjective ones — voice, specificity, helpfulness.
//
// Uses Sonnet 4.6 because we want a discriminating taste reviewer
// here. Judge calls are non-streaming and capped at 256 tokens out
// (we only need a score + a one-line reason).

import Anthropic from '@anthropic-ai/sdk';
import type { EvalCase } from './cases';

export interface JudgeVerdict {
  score: number; // 1–5
  reason: string;
}

const JUDGE_SYSTEM = `You are a senior travel writer reviewing AI-generated itineraries. Score on a 1-5 scale where:
1 = generic, vague, or padded — could be any city
2 = some specifics but feels listicle-ish
3 = solid, useful, but not memorable
4 = specific names + good rhythm + clear personality
5 = the kind of itinerary a friend who lived there would write

Penalize: invented place names that don't ring true, time blocks without rhythm, missing transit details, ignoring stated dietary or budget constraints.

Reward: real neighborhood specificity, sensory detail, plausible meal-to-meal flow, honoring constraints.

Output format: a single JSON object {"score": <int 1-5>, "reason": "<one sentence>"}. No code fences, no preamble.`;

export async function judgeNarrative(
  client: Anthropic,
  c: EvalCase,
  output: string,
): Promise<JudgeVerdict> {
  const userMessage = `Case: ${c.id}
Original prompt: ${c.prompt}
${c.dietaryTerm ? `Required dietary respect: ${c.dietaryTerm}\n` : ''}
Generated itinerary:
---
${output}
---

Score this 1-5. JSON only.`;

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(raw) as { score?: number; reason?: string };
    const score = Math.max(1, Math.min(5, Math.round(parsed.score ?? 0)));
    return { score, reason: parsed.reason ?? '(no reason given)' };
  } catch {
    return { score: 0, reason: `judge returned non-JSON: ${raw.slice(0, 80)}` };
  }
}
