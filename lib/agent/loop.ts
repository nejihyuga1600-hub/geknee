import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext } from './tools';
import { addTokenUsage } from '@/lib/tokenTracking';
import { breadcrumb, captureError } from '@/lib/sentry';

const MODEL = 'claude-sonnet-4-6';

// Production guardrails. A misbehaving prompt could in principle make
// the model demand 50 geocodes in one turn or chain 30 turns of tools.
// These caps abort the loop with a tool_error rather than letting it
// run our token bill into the ground.
const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_TOTAL_TOOL_CALLS = 30;
const MAX_TOTAL_INPUT_TOKENS = 100_000;
const MAX_TOTAL_OUTPUT_TOKENS = 30_000;

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown; durationMs: number }
  | { type: 'tool_error'; name: string; error: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; reason: string };

export interface AgentLoopArgs {
  client: Anthropic;
  systemPrompt: string;
  userPrompt: string;
  tools: AgentTool[];
  ctx: ToolContext;
  maxIterations?: number;
  maxTokens?: number;
  onEvent: (e: AgentEvent) => void | Promise<void>;
}

// Tool-use loop. Each iteration sends the conversation to Claude,
// streams text deltas back to onEvent, then if the model requested
// tools we run them, append the results, and loop again. Stops when
// the model returns end_turn or we hit maxIterations.
//
// Token usage is summed across iterations and persisted once at the
// end via addTokenUsage so we don't hammer Prisma per-turn.
export async function runAgent(args: AgentLoopArgs): Promise<void> {
  const { client, systemPrompt, userPrompt, tools, ctx, onEvent } = args;
  const maxIter = args.maxIterations ?? 12;
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

  let totalIn = 0;
  let totalOut = 0;
  let totalToolCalls = 0;
  let stopReason: string = 'unknown';

  breadcrumb('agent', 'loop start', { userId: ctx.userId, tripId: ctx.tripId, toolCount: tools.length });

  for (let iter = 0; iter < maxIter; iter++) {
    const stream = client.messages.stream({
      model: MODEL,
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
      totalIn += final.usage.input_tokens;
      totalOut += final.usage.output_tokens;
      await onEvent({
        type: 'usage',
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });
    }

    if (totalIn > MAX_TOTAL_INPUT_TOKENS || totalOut > MAX_TOTAL_OUTPUT_TOKENS) {
      const reason = `token budget exceeded (in=${totalIn}/${MAX_TOTAL_INPUT_TOKENS}, out=${totalOut}/${MAX_TOTAL_OUTPUT_TOKENS})`;
      breadcrumb('agent', 'aborted: token budget', { totalIn, totalOut });
      await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
      stopReason = 'budget_exhausted';
      break;
    }

    const toolCalls = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    stopReason = final.stop_reason ?? 'unknown';

    if (toolCalls.length === 0 || stopReason === 'end_turn') {
      break;
    }

    if (toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
      const reason = `model requested ${toolCalls.length} tools in one turn (cap ${MAX_TOOL_CALLS_PER_TURN})`;
      breadcrumb('agent', 'aborted: per-turn tool cap', { requested: toolCalls.length });
      await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
      stopReason = 'per_turn_cap';
      break;
    }

    if (totalToolCalls + toolCalls.length > MAX_TOTAL_TOOL_CALLS) {
      const reason = `total tool calls would exceed cap ${MAX_TOTAL_TOOL_CALLS} (so far ${totalToolCalls}, this turn ${toolCalls.length})`;
      breadcrumb('agent', 'aborted: total tool cap', { totalToolCalls, requested: toolCalls.length });
      await onEvent({ type: 'tool_error', name: '__guardrail__', error: reason });
      stopReason = 'total_cap';
      break;
    }
    totalToolCalls += toolCalls.length;

    messages.push({ role: 'assistant', content: final.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      await onEvent({ type: 'tool_call', name: call.name, input: call.input });
      const tool = toolByName.get(call.name);
      if (!tool) {
        toolResults.push({
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
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result),
        });
        await onEvent({ type: 'tool_result', name: call.name, result, durationMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        captureError(err, { tool: call.name, input: call.input, userId: ctx.userId, tripId: ctx.tripId });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: msg,
          is_error: true,
        });
        await onEvent({ type: 'tool_error', name: call.name, error: msg });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  await onEvent({ type: 'done', reason: stopReason });
  breadcrumb('agent', 'loop end', {
    stopReason,
    totalIn,
    totalOut,
    totalToolCalls,
  });

  if (ctx.userId && (totalIn || totalOut)) {
    // Best-effort: don't let DB hiccups bubble up and abort the response.
    await addTokenUsage(ctx.userId, totalIn, totalOut).catch(() => undefined);
  }
}
