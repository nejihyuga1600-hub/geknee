// Tool definition for the geknee planning agent.
//
// Each tool has a JSON Schema describing its input (consumed by
// Anthropic's tool_use API) plus a TypeScript handler. The agent loop
// validates the model's tool input against the schema before invoking
// the handler, so handlers can trust their input shape at runtime.

import { echoTool } from './tools/echo';
import { geocodeTool } from './tools/geocode';
import { routeBetweenTool } from './tools/route_between';
import { weatherForecastTool } from './tools/weather_forecast';
import { findPlacesTool } from './tools/find_places';
import { recallUserContextTool } from './tools/recall_user_context';
import { flightSearchTool } from './tools/flight_search';
import { currencyConvertTool } from './tools/currency_convert';

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
// Order is hint-only — Anthropic uses it for tie-breaking. Foundational
// tools first (geocode → everything else needs lat/lon), then enrichment.
export function getAgentTools(): AgentTool[] {
  return [
    geocodeTool,
    routeBetweenTool,
    findPlacesTool,
    weatherForecastTool,
    flightSearchTool,
    currencyConvertTool,
    recallUserContextTool,
    echoTool,
  ];
}
