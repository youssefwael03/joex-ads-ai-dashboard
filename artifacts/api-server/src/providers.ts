import Anthropic from "@anthropic-ai/sdk";

export type ProviderName =
  | "claude"
  | "groq"
  | "mistral"
  | "cloudflare"
  | "deepseek"
  | "openrouter_free";

export interface AIMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface AIResponse {
  content: string;
  provider: ProviderName;
  model: string;
  tokens: number;
  toolCalls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  finishReason?: string;
}

// Fixed provider chain — tried in order, auto-fallback on error
// Gemini removed: free tier has limit: 0 and will never work
const PROVIDER_CHAIN: ProviderName[] = [
  "claude",
  "groq",
  "mistral",
  "cloudflare",
  "deepseek",
  "openrouter_free",
];

// Fixed models for each provider
const PROVIDER_MODELS: Record<ProviderName, string> = {
  claude:          "claude-haiku-4-5-20251001",
  groq:            "llama-3.3-70b-versatile",
  mistral:         "mistral-small-latest",
  cloudflare:      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  deepseek:        "deepseek/deepseek-v4-flash:free",
  openrouter_free: "openrouter/free",
};

// Daily token limits per provider
export const PROVIDER_LIMITS: Record<ProviderName, number> = {
  claude:          1_000_000,
  groq:            500_000,
  mistral:         1_000_000,
  cloudflare:      1_000_000,
  deepseek:        1_000_000,
  openrouter_free: 1_000_000,
};

// ── Claude model discovery ─────────────────────────────────────────────────────
// Start with known-good model; try to confirm/update from the integration's /models list at startup

let claudeModel = "claude-haiku-4-5-20251001";

async function initClaudeModel(): Promise<void> {
  try {
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (!baseURL || !apiKey) return;
    const res = await fetch(`${baseURL}/models`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      const first: string | undefined = data?.data?.[0]?.id;
      if (first) claudeModel = first;
    }
  } catch {
    // keep default
  }
  console.log("[claude] model:", claudeModel);
}

// ── OpenRouter startup check ───────────────────────────────────────────────────
console.log("[openrouter] key set:", !!process.env.OPENROUTER_API_KEY);

// Non-blocking model discovery
initClaudeModel().catch(() => {});

// Track daily usage per provider (resets at midnight)
const dailyUsage: Record<ProviderName, { tokens: number; date: string }> = {} as any;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getUsage(provider: ProviderName): number {
  const today = getTodayDate();
  if (!dailyUsage[provider] || dailyUsage[provider].date !== today) {
    dailyUsage[provider] = { tokens: 0, date: today };
  }
  return dailyUsage[provider].tokens;
}

function addUsage(provider: ProviderName, tokens: number): void {
  const today = getTodayDate();
  if (!dailyUsage[provider] || dailyUsage[provider].date !== today) {
    dailyUsage[provider] = { tokens: 0, date: today };
  }
  dailyUsage[provider].tokens += tokens;
}

function isProviderAvailable(provider: ProviderName): boolean {
  return getUsage(provider) < PROVIDER_LIMITS[provider];
}

export function getProviderStatus(): Record<
  ProviderName,
  { used: number; limit: number; available: boolean }
> {
  const status: any = {};
  for (const provider of PROVIDER_CHAIN) {
    status[provider] = {
      used:      getUsage(provider),
      limit:     PROVIDER_LIMITS[provider],
      available: isProviderAvailable(provider),
    };
  }
  return status;
}

// Main function — tries providers in order, auto-fallback on error
export async function callWithFallback(
  messages: AIMessage[],
  tools: any[],
  systemPrompt: string,
): Promise<AIResponse> {
  const errors: string[] = [];

  for (const provider of PROVIDER_CHAIN) {
    if (!isProviderAvailable(provider)) {
      errors.push(`${provider}: daily limit reached`);
      continue;
    }

    try {
      const result = await callProvider(provider, messages, tools, systemPrompt);
      addUsage(provider, result.tokens);
      return result;
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
      console.warn(`[providers] ${provider} failed, trying next...`, err.message);
      continue;
    }
  }

  throw new Error(`All providers failed:\n${errors.join("\n")}`);
}

// ── Provider call implementations ─────────────────────────────────────────────

export async function callProvider(
  provider: ProviderName,
  messages: AIMessage[],
  tools: any[],
  systemPrompt: string,
): Promise<AIResponse> {
  const model = PROVIDER_MODELS[provider];

  // ── Claude via Replit AI Integration ──────────────────────────────────────
  if (provider === "claude") {
    const client = new Anthropic({
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    });

    // Use dynamically discovered model (resolved at startup from /models endpoint)
    const resolvedModel = claudeModel;

    // Convert OAI tools → Anthropic format
    const anthropicTools = tools.length > 0
      ? tools.map((t: any) => ({
          name:         t.function.name,
          description:  t.function.description,
          input_schema: t.function.parameters,
        }))
      : undefined;

    // Convert AIMessage[] → Anthropic message format
    const anthropicMessages: any[] = [];
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.tool_calls?.length) {
        const content: any[] = [];
        if (msg.content) content.push({ type: "text", text: msg.content });
        for (const tc of msg.tool_calls) {
          content.push({
            type:  "tool_use",
            id:    tc.id,
            name:  tc.function.name,
            input: (() => { try { return JSON.parse(tc.function.arguments || "{}"); } catch { return {}; } })(),
          });
        }
        anthropicMessages.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        const last = anthropicMessages[anthropicMessages.length - 1];
        const toolResult = {
          type:        "tool_result",
          tool_use_id: msg.tool_call_id,
          content:     msg.content ?? "",
        };
        if (last?.role === "user" && Array.isArray(last.content)) {
          last.content.push(toolResult);
        } else {
          anthropicMessages.push({ role: "user", content: [toolResult] });
        }
      } else if (msg.role === "user" || msg.role === "assistant") {
        anthropicMessages.push({ role: msg.role, content: msg.content ?? "" });
      }
    }

    const response = await client.messages.create({
      model:      resolvedModel,
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   anthropicMessages,
      tools:      anthropicTools as any,
    });

    const content = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    const toolCalls = response.content
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({
        id:   b.id,
        type: "function" as const,
        function: {
          name:      b.name,
          arguments: JSON.stringify(b.input ?? {}),
        },
      }));

    return {
      content,
      provider,
      model:       resolvedModel,
      tokens:      response.usage.input_tokens + response.usage.output_tokens,
      toolCalls:   toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: response.stop_reason === "end_turn" ? "stop" : (response.stop_reason ?? undefined),
    };
  }

  // ── Groq ───────────────────────────────────────────────────────────────────
  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content    = data.choices?.[0]?.message?.content ?? "";
    const toolCalls  = data.choices?.[0]?.message?.tool_calls;
    const tokens     = data.usage?.total_tokens ?? 0;

    return {
      content,
      provider,
      model,
      tokens,
      toolCalls:   toolCalls?.length > 0 ? toolCalls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── Mistral ────────────────────────────────────────────────────────────────
  if (provider === "mistral") {
    if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not set");
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Mistral ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content   = data.choices?.[0]?.message?.content ?? "";
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    const tokens    = data.usage?.total_tokens ?? 0;

    return {
      content,
      provider,
      model,
      tokens,
      toolCalls:   toolCalls?.length > 0 ? toolCalls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── Cloudflare Workers AI ──────────────────────────────────────────────────
  if (provider === "cloudflare") {
    if (!process.env.CLOUDFLARE_API_KEY) throw new Error("CLOUDFLARE_API_KEY not set");
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_ACCOUNT_ID not set");

    // Cloudflare has limited tool support — collapse tool messages to text
    const cfMessages = messages
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: m.content ?? "",
      }));

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
        },
        body: JSON.stringify({
          messages:   [{ role: "system", content: systemPrompt }, ...cfMessages],
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) throw new Error(`Cloudflare ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content = data.result?.response ?? "";
    const tokens  = data.result?.usage?.total_tokens ?? 500;

    return { content, provider, model, tokens };
  }

  // ── DeepSeek via OpenRouter (fixed model) ─────────────────────────────────
  if (provider === "deepseek") {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer":  "https://joexads.repl.co",
        "X-Title":       "Joex Ads Dashboard",
      },
      body: JSON.stringify({
        model:      "deepseek/deepseek-v4-flash:free",
        max_tokens: 1500,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content   = data.choices?.[0]?.message?.content ?? "";
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    const tokens    = data.usage?.total_tokens ?? 0;

    return {
      content,
      provider,
      model,
      tokens,
      toolCalls:   toolCalls?.length > 0 ? toolCalls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── OpenRouter Free — last resort ─────────────────────────────────────────
  if (provider === "openrouter_free") {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer":  "https://joexads.repl.co",
        "X-Title":       "Joex Ads Dashboard",
      },
      body: JSON.stringify({
        model:      "openrouter/free",
        max_tokens: 1500,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    const content   = data.choices?.[0]?.message?.content ?? "";
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    const tokens    = data.usage?.total_tokens ?? 0;

    return {
      content,
      provider,
      model,
      tokens,
      toolCalls:   toolCalls?.length > 0 ? toolCalls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}
