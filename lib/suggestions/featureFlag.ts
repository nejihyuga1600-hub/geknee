// lib/suggestions/featureFlag.ts
// Single source of truth for whether the chat-aware suggestion feature
// is enabled. Defaults to OFF so the work can ship dark.

export const CHAT_SUGGESTIONS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS === '1';
