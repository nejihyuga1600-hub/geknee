import type { AgentTool } from '../tools';

// Smoke-test tool. Lets us verify the tool_use loop in production
// without depending on external API keys. The system prompt instructs
// the agent NOT to call this in real planning turns.
export const echoTool: AgentTool = {
  name: 'echo',
  description:
    'Diagnostic tool. Echoes a string back to the agent. Only call when explicitly told to test the agent loop. Never call during real itinerary planning.',
  input_schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Text to echo back.' },
    },
    required: ['message'],
  },
  handler: async (input) => {
    const { message } = input as { message: string };
    return { echoed: message, ts: Date.now() };
  },
};
