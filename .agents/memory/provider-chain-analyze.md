---
name: Provider chain & analyze mode
description: How the AI provider chain works and why analyze mode skips Groq.
---

## Rule
In `providers.ts`, there are two chains:
- `PROVIDER_CHAIN` (default): groq → mistral → cloudflare → deepseek → openrouter_free
- `ANALYZE_CHAIN` (analyze mode): mistral → cloudflare → deepseek → openrouter_free

`callWithFallback(messages, tools, systemPrompt, mode?)` selects the chain based on `mode`.

**Why:** Groq's llama-3.3-70b hallucinates campaign data and invents metrics when asked to analyze without having already fetched real tool results. In analyze mode, the AI MUST call tools before summarizing — Groq skips this step and fabricates numbers.

**How to apply:** Pass `taskMode` as the 4th argument to `callWithFallback` from the AI route handler (ai.ts agentic loop).
