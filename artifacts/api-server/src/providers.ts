export type ProviderName =
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
const PROVIDER_CHAIN: ProviderName[] = [
  "groq",
  "mistral",
  "cloudflare",
  "deepseek",
  "openrouter_free",
];

// Analyze mode skips Groq — Groq hallucinates data when it has no real tool results
const ANALYZE_CHAIN: ProviderName[] = [
  "mistral",
  "cloudflare",
  "deepseek",
  "openrouter_free",
];

// Fixed models for each provider
const PROVIDER_MODELS: Record<ProviderName, string> = {
  groq:            "llama-3.3-70b-versatile",
  mistral:         "mistral-small-latest",
  cloudflare:      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  deepseek:        "deepseek/deepseek-v4-flash:free",
  openrouter_free: "openrouter/free",
};

// Daily token limits per provider
export const PROVIDER_LIMITS: Record<ProviderName, number> = {
  groq:            500_000,
  mistral:         1_000_000,
  cloudflare:      1_000_000,
  deepseek:        1_000_000,
  openrouter_free: 1_000_000,
};

// ── OpenRouter startup check ───────────────────────────────────────────────────
console.log("[openrouter] key set:", !!process.env.OPENROUTER_API_KEY);

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
// mode="analyze" uses ANALYZE_CHAIN (skips Groq to prevent hallucinations)
export async function callWithFallback(
  messages: AIMessage[],
  tools: any[],
  systemPrompt: string,
  mode?: string,
): Promise<AIResponse> {
  const errors: string[] = [];
  const chain = mode === "analyze" ? ANALYZE_CHAIN : PROVIDER_CHAIN;

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

// ── Provider call implementations ─────────────────────────────────────────────

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
        max_tokens: 4000,
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
        max_tokens: 4000,
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
          max_tokens: 4000,
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
        max_tokens: 4000,
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
        max_tokens: 4000,
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
