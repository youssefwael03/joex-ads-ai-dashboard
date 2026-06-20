export type ProviderName =
  | "groq"
  | "gemini"
  | "deepseek"
  | "cerebras"
  | "mistral"
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

// ── Mode-specific provider chains ─────────────────────────────────────────────
// Each chain is tried in order; first provider to succeed wins.

// Execute mode: Groq first for speed (tool-use model), then others
const EXECUTE_CHAIN: ProviderName[] = [
  "groq",
  "gemini",
  "deepseek",
  "cerebras",
  "mistral",
  "openrouter_free",
];

// Analyze mode: skip Groq (hallucinates data without real tool results), Gemini first
const ANALYZE_CHAIN: ProviderName[] = [
  "gemini",
  "deepseek",
  "cerebras",
  "mistral",
  "openrouter_free",
];

// Plan mode: DeepSeek for strategic reasoning, then Gemini
const PLAN_CHAIN: ProviderName[] = [
  "deepseek",
  "gemini",
  "cerebras",
  "mistral",
  "openrouter_free",
];

// Chat mode: Cerebras for speed, then Groq, then others
const CHAT_CHAIN: ProviderName[] = [
  "cerebras",
  "groq",
  "mistral",
  "gemini",
  "openrouter_free",
];

// Default chain (used when mode is unknown)
const DEFAULT_CHAIN: ProviderName[] = EXECUTE_CHAIN;

// Fixed models for each provider
const PROVIDER_MODELS: Record<ProviderName, string> = {
  groq:            "llama-3.3-70b-versatile",
  gemini:          "gemini-2.0-flash",
  deepseek:        "deepseek/deepseek-v4-flash:free",
  cerebras:        "llama-3.3-70b",
  mistral:         "mistral-small-latest",
  openrouter_free: "openrouter/free",
};

// Daily token limits per provider
export const PROVIDER_LIMITS: Record<ProviderName, number> = {
  groq:            500_000,
  gemini:          1_000_000,
  deepseek:        1_000_000,
  cerebras:        500_000,
  mistral:         1_000_000,
  openrouter_free: 1_000_000,
};

console.log("[providers] groq:", !!process.env.GROQ_API_KEY);
console.log("[providers] gemini:", !!process.env.GEMINI_API_KEY);
console.log("[providers] cerebras:", !!process.env.CEREBRAS_API_KEY);
console.log("[providers] mistral:", !!process.env.MISTRAL_API_KEY);
console.log("[providers] openrouter:", !!process.env.OPENROUTER_API_KEY);

// ── Daily usage tracking ───────────────────────────────────────────────────────

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
  for (const provider of DEFAULT_CHAIN) {
    status[provider] = {
      used:      getUsage(provider),
      limit:     PROVIDER_LIMITS[provider],
      available: isProviderAvailable(provider),
    };
  }
  return status;
}

function getChainForMode(mode?: string): ProviderName[] {
  switch (mode) {
    case "analyze": return ANALYZE_CHAIN;
    case "plan":    return PLAN_CHAIN;
    case "chat":    return CHAT_CHAIN;
    case "execute": return EXECUTE_CHAIN;
    default:        return DEFAULT_CHAIN;
  }
}

// ── Main fallback function ─────────────────────────────────────────────────────

export async function callWithFallback(
  messages: AIMessage[],
  tools: any[],
  systemPrompt: string,
  mode?: string,
): Promise<AIResponse> {
  const errors: string[] = [];
  const chain = getChainForMode(mode);

  for (const provider of chain) {
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

// ── Provider implementations ───────────────────────────────────────────────────

export async function callProvider(
  provider: ProviderName,
  messages: AIMessage[],
  tools: any[],
  systemPrompt: string,
): Promise<AIResponse> {
  const model = PROVIDER_MODELS[provider];

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
        max_tokens: 4096,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── Gemini (OpenAI-compatible endpoint) ────────────────────────────────────
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages:   [{ role: "system", content: systemPrompt }, ...messages],
          tools:      tools.length > 0 ? tools : undefined,
        }),
        signal: AbortSignal.timeout(40_000),
      },
    );

    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── DeepSeek via OpenRouter ────────────────────────────────────────────────
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
        max_tokens: 4096,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── Cerebras ───────────────────────────────────────────────────────────────
  if (provider === "cerebras") {
    if (!process.env.CEREBRAS_API_KEY) throw new Error("CEREBRAS_API_KEY not set");
    const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Cerebras ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
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
        max_tokens: 4096,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Mistral ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  // ── OpenRouter Free (last resort) ─────────────────────────────────────────
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
        max_tokens: 4096,
        messages:   [{ role: "system", content: systemPrompt }, ...messages],
        tools:      tools.length > 0 ? tools : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
    const data = await response.json() as any;
    return {
      content:      data.choices?.[0]?.message?.content ?? "",
      provider,
      model,
      tokens:       data.usage?.total_tokens ?? 0,
      toolCalls:    data.choices?.[0]?.message?.tool_calls?.length > 0 ? data.choices[0].message.tool_calls : undefined,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }

  throw new Error(`Unknown provider: ${provider}`);
}
