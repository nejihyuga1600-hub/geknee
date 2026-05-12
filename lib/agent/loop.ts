import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext } from './tools';
import { addTokenUsage } from '@/lib/tokenTracking';
import { breadcrumb, captureError } from '@/lib/sentry';

// Two-model split. Haiku 4.5 drives the tool-calling phase (deciding
// "geocode then weather then find_places" doesn't need Sonnet's
// reasoning, and Haiku is ~3x cheaper input / 3x cheaper output).
// Sonnet 4.6 takes over for the final synthesis turn where the
// markdown itinerary is actually written — quality matters most here.
const PLANNER_MODEL = 'claude-haiku-4-5-20251001';
const SYNTH_MODEL = 'claude-sonnet-4-6';

// Production guardrails. A misbehaving prompt could in principle make
// the model demand 50 geocodes in one turn or chain 30 turns of tools.
// These caps abort the loop with a tool_error rather than letting it
// run our token bill into the ground.
const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_TOTAL_TOOL_CALLS = 30;
const MAX_TOTAL_INPUT_TOKENS = 100_000;
const MAX_TOTAL_OUTPUT_TOKENS = 30_000;
const MAX_PLANNER_ITERATIONS = 10;
const MAX_SYNTH_ITERATIONS = 3; // synthesis usually 1, allow 2 if Sonnet asks for more tools

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown; durationMs: number }
  | { type: 'tool_error'; name: string; error: string }
  | { type: 'usage'; model: string; inputTokens: number; outputTokens: number }
  | { type: 'phase'; phase: 'planning' | 'synthesis'; model: string }
  | { type: 'done'; reason: string };

export interface AgentLoopArgs {
  client: Anthropic;
  systemPrompt: string;
  userPrompt: string;
  tools: AgentTool[];
  ctx: ToolContext;
  maxTokens?: number;
  onEvent: (e: AgentEvent) => void | Promise<void>;
}

interface BudgetState {
  totalIn: number;
  totalOut: number;
  totalToolCalls: number;
}

// Two-phase agent loop. Phase 1 runs the planner model in a non-
// streaming tool-use loop, gathering facts. Phase 2 runs the synthesis
// model in a streaming pass that produces the user-visible markdown.
//
// Token usage from both models is summed and persisted once at the end
// via addTokenUsage (we don't break out by model — calcCostUsd already
// uses Sonnet rates, so this overestimates for the Haiku portion,
// which is the conservative direction).
export async function runAgent(args: AgentLoopArgs): Promise<void> {
  const { client, systemPrompt, userPrompt, tools, ctx, onEvent } = args;
  const maxTokens = args.maxTokens ?? 4096;

  const toolByName = new Map(tools.map((t) => [t.name, t]));

  // cache_control on the last tool flags the entire tools array as a
  // cacheable prefix (1.5–2× cost reduction across an agent loop because
  // tool defs + system prompt are re-sent every turn). Same pattern for
  // the system block. Anthropic charges full price on the first hit and
  // 10% on subsequent reads within 5 minutes.
  const toolsForApi = tools.map(({ handler: _handler, ...t }, i) =>
    i === tools.length - 1
      ? { ...t, cache_control: { type: 'ephemeral' as const } }
      : t,
  );
  const systemForApi = [
    { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  const budget: BudgetState = { totalIn: 0, totalOut: 0, totalToolCalls: 0 };
  let stopReason = 'unknown';

  breadcrumb('agent', 'loop start', {
    userId: ctx.userId,
    tripId: ctx.tripId,
    toolCount: tools.length,
  });

  // ── Phase 1: planner (Haiku) ──────────────────────────────────────────────
  await onEvent({ type: 'phase', phase: 'planning', model: PLANNER_MODEL });

  let exitReason: 'ready_to_synthesize' | 'guardrail' | 'planner_exhausted' = 'planner_exhausted';

  for (let iter = 0; iter < MAX_PLANNER_ITERATIONS; iter++) {
    const resp = await client.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 1024, // planner outputs are small (tool_use blocks)
      system: systemForApi,
      tools: toolsForApi,
      messages,
    });

    if (resp.usage) {
      budget.totalIn += resp.usage.input_tokens;
      budget.totalOut += resp.usage.output_tokens;
      await onEvent({
        type: 'usage',
        model: PLANNER_MODEL,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
      });
    }

    if (await checkBudget(budget, onEvent)) {
      stopReason = 'budget_exhausted';
      exitReason = 'guardrail';
      break;
    }

    const toolCalls = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolCalls.length === 0) {
      // Planner is done gathering facts → hand off to synthesis.
      exitReason = 'ready_to_synthesize';
      break;
    }

    if (await checkToolCallCaps(toolCalls.length, budget, onEvent)) {
      stopReason = toolCalls.length > MAX_TOOL_CALLS_PER_TURN ? 'per_turn_cap' : 'total_cap';
      exitReason = 'guardrail';
      break;
    }
    budget.totalToolCalls += toolCalls.length;

    messages.push({ role: 'assistant', content: resp.content });
    messages.push({
      role: 'user',
      content: await runTools(toolCalls, toolByName, ctx, onEvent),
    });
  }

  if (exitReason === 'guardrail') {
    await finish(stopReason, budget, ctx, onEvent);
    return;
  }
  if (exitReason === 'planner_exhausted') {
    breadcrumb('agent', 'planner exhausted iterations', { iterations: MAX_PLANNER_ITERATIONS });
    // Fall through to synthesis anyway — Sonnet will produce something
    // from whatever facts the planner gathered.
  }

  // ── Phase 2: synthesis (Sonnet) ───────────────────────────────────────────
  await onEvent({ type: 'phase', phase: 'synthesis', model: SYNTH_MODEL });

  for (let iter = 0; iter < MAX_SYNTH_ITERATIONS; iter++) {
    const stream = client.messages.stream({
      model: SYNTH_MODEL,
      max_tokens: maxTokens,
      system: systemForApi,
      tools: toolsForApi,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        await onEvent({ type: 'text', delta: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    if (final.usage) {
      budget.totalIn += final.usage.input_tokens;
      budget.totalOut += final.usage.output_tokens;
      await onEvent({
        type: 'usage',
        model: SYNTH_MODEL,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });
    }

    stopReason = final.stop_reason ?? 'unknown';

    if (await checkBudget(budget, onEvent)) {
      stopReason = 'budget_exhausted';
      break;
    }

    const toolCalls = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolCalls.length === 0 || stopReason === 'end_turn') {
      break;
    }

    // Sonnet asked for more tools — usually because the planner missed
    // something. Run them and let Sonnet try synthesis again.
    if (await checkToolCallCaps(toolCalls.length, budget, onEvent)) {
      stopReason = toolCalls.length > MAX_TOOL_CALLS_PER_TURN ? 'per_turn_cap' : 'total_cap';
      break;
    }
    budget.totalToolCalls += toolCalls.length;

    messages.push({ role: 'assistant', content: final.content });
    messages.push({
      role: 'user',
      content: await runTools(toolCalls, toolByName, ctx, onEvent),
    });
  }

  await finish(stopReason, budget, ctx, onEvent);
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function runTools(
  toolCalls: Anthropic.ToolUseBlock[],
  toolByName: Map<string, AgentTool>,
  ctx: ToolContext,
  onEvent: AgentLoopArgs['onEvent'],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const call of toolCalls) {
    await onEvent({ type: 'tool_call', name: call.name, input: call.input });
    const tool = toolByName.get(call.name);
    if (!tool) {
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: `Unknown tool: ${call.name}`,
        is_error: true,
      });
      await onEvent({ type: 'tool_error', name: call.name, error: 'unknown tool' });
      continue;
    }
    const t0 = Date.now();
    breadcrumb('agent.tool', `call ${call.name}`, { input: call.input });
    try {
      const result = await tool.handler(call.input as Record<string, unknown>, ctx);
      const durationMs = Date.now() - t0;
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
      await onEvent({ type: 'tool_result', name: call.name, result, durationMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      captureError(err, {
        tool: call.name,
        input: call.input,
        userId: ctx.userId,
        tripId: ctx.tripId,
      });
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: msg,
        is_error: true,
      });
      await onEvent({ type: 'tool_error', name: call.name, error: msg });
    }
  }
  return results;
}

async function checkBudget(b: BudgetState, onEvent: AgentLoopArgs['onEvent']): Promise<boolean> {
  if (b.totalIn > MAX_TOTAL_INPUT_TOKENS || b.totalOut > MAX_TOTAL_OUTPUT_TOKENS) {
    const reason = `token budget exceeded (in=${b.totalIn}/${MAX_TOTAL_INPUT_TOKENS}, out=${b.totalOut}/${MAX_TOTAL_OUTPUT_TOKENS})`;
    breadcrumb('agent', 'aborted: token budget', { totalIn: b.totalIn, totalOut: b.totalOut });
    await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
    return true;
  }
  return false;
}

async function checkToolCallCaps(
  thisTurnCalls: number,
  b: BudgetState,
  onEvent: AgentLoopArgs['onEvent'],
): Promise<boolean> {
  if (thisTurnCalls > MAX_TOOL_CALLS_PER_TURN) {
    const reason = `model requested ${thisTurnCalls} tools in one turn (cap ${MAX_TOOL_CALLS_PER_TURN})`;
    breadcrumb('agent', 'aborted: per-turn tool cap', { requested: thisTurnCalls });
    await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
    return true;
  }
  if (b.totalToolCalls + thisTurnCalls > MAX_TOTAL_TOOL_CALLS) {
    const reason = `total tool calls would exceed cap ${MAX_TOTAL_TOOL_CALLS} (so far ${b.totalToolCalls}, this turn ${thisTurnCalls})`;
    breadcrumb('agent', 'aborted: total tool cap', {
      totalToolCalls: b.totalToolCalls,
      requested: thisTurnCalls,
    });
    await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
    return true;
  }
  return false;
}

async function finish(
  stopReason: string,
  b: BudgetState,
  ctx: ToolContext,
  onEvent: AgentLoopArgs['onEvent'],
): Promise<void> {
  await onEvent({ type: 'done', reason: stopReason });
  breadcrumb('agent', 'loop end', {
    stopReason,
    totalIn: b.totalIn,
    totalOut: b.totalOut,
    totalToolCalls: b.totalToolCalls,
  });
  if (ctx.userId && (b.totalIn || b.totalOut)) {
    await addTokenUsage(ctx.userId, b.totalIn, b.totalOut).catch(() => undefined);
  }
}
