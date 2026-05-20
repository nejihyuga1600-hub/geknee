// lib/suggestions/featureFlag.ts
// Single source of truth for whether the chat-aware suggestion feature
// is enabled. Now defaults to ON — the feature shipped in 3018837
// (release: chat-aware AI suggestions + multi-user trips). The env var
// stays as a kill switch: set NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS=0 to
// disable in any environment, otherwise it's live.

export const CHAT_SUGGESTIONS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CHAT_SUGGESTIONS !== '0';
