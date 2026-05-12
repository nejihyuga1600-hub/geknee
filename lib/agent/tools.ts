// Tool definition for the geknee planning agent.
//
// Each tool has a JSON Schema describing its input (consumed by
// Anthropic's tool_use API) plus a TypeScript handler. The agent loop
// validates the model's tool input against the schema before invoking
// the handler, so handlers can trust their input shape at runtime.

import { echoTool } from './tools/echo';

export interface ToolContext {
  userId: string;
  tripId?: string;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  input: TInput,
  ctx: ToolContext,
) => Promise<TOutput>;

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: ToolHandler;
}

// Returns the tools currently exposed to the agent. New tools land here.
// During Phase 1 (skeleton) only `echo` is wired so we can prove the
// tool_use loop end-to-end without leaning on geocoding / mapbox keys.
export function getAgentTools(): AgentTool[] {
  return [echoTool];
}
