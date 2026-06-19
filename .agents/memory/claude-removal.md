---
name: Claude removal
description: History of why claude was removed from the provider chain.
---

## Rule
Claude is fully removed from the provider stack. Do NOT re-add it.

**Why:** The `ProviderName` type never included "claude" but PROVIDER_CHAIN/MODELS/LIMITS/callProvider all had claude entries. This caused `Anthropic is not defined` runtime errors on every call because `@anthropic-ai/sdk` was not imported. The Replit AI integration for Anthropic is present (env vars exist) but the implementation was broken and the ProviderName type excluded it, so removing all claude code was cleaner than fixing it.

**How to apply:** If asked to re-add claude: add "claude" to ProviderName type, install @anthropic-ai/sdk, restore callProvider implementation, and re-add to PROVIDER_CHAIN. Do NOT add it to ANALYZE_CHAIN.
