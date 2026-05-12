import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext } from './tools';
import { addTokenUsage } from '@/lib/tokenTracking';

const MODEL = 'claude-sonnet-4-6';

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
  const toolsForApi = tools.map(({ handler: _handler, ...t }) => t);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let stopReason: string = 'unknown';

  for (let iter = 0; iter < maxIter; iter++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
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

    const toolCalls = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    stopReason = final.stop_reason ?? 'unknown';

    if (toolCalls.length === 0 || stopReason === 'end_turn') {
      break;
    }

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

  if (ctx.userId && (totalIn || totalOut)) {
    // Best-effort: don't let DB hiccups bubble up and abort the response.
    await addTokenUsage(ctx.userId, totalIn, totalOut).catch(() => undefined);
  }
}
