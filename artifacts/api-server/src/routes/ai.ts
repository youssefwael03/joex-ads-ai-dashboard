import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Provider detection ────────────────────────────────────────────────────────
// Priority: OPENROUTER_API_KEY → OpenRouter (free models)
//           OPENAI_API_KEY     → OpenAI directly (api.openai.com)

type Provider = "openrouter" | "openai";

function getProvider(): Provider {
  // Explicit OpenRouter key → OpenRouter
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  const oaiKey = process.env.OPENAI_API_KEY ?? "";
  if (!oaiKey) throw new Error("No AI API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.");
  // OpenRouter keys start with "sk-or-" — detect even if stored in OPENAI_API_KEY
  if (oaiKey.startsWith("sk-or-")) return "openrouter";
  return "openai";
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No AI API key configured.");
  return key;
}

// ── Model catalogues ─────────────────────────────────────────────────────────

interface ModelInfo { id: string; name: string; description: string }

const OPENROUTER_MODELS: ModelInfo[] = [
  { id: "auto",                                          name: "Auto",               description: "Tries all models in order, skips unavailable ones" },
  { id: "deepseek/deepseek-chat-v3-0324:free",          name: "DeepSeek V3",        description: "Best reasoning & tool use (free)" },
  { id: "deepseek/deepseek-v4-flash:free",              name: "DeepSeek V4 Flash",  description: "Latest DeepSeek, fast responses (free)" },
  { id: "deepseek/deepseek-r1:free",                    name: "DeepSeek R1",        description: "Advanced reasoning model (free)" },
  { id: "google/gemini-2.5-flash-preview-05-20:free",   name: "Gemini 2.5 Flash",   description: "Latest Gemini, fast & multimodal (free)" },
  { id: "qwen/qwen3-235b-a22b:free",                    name: "Qwen3 235B",         description: "Largest Qwen, powerful (free)" },
  { id: "qwen/qwen3-32b:free",                          name: "Qwen3 32B",          description: "Strong analytical model (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",       name: "Llama 3.3 70B",     description: "Open-source powerhouse (free)" },
  { id: "meta-llama/llama-3.1-8b-instruct:free",        name: "Llama 3.1 8B",      description: "Fast & lightweight (free)" },
  { id: "mistralai/mistral-7b-instruct:free",            name: "Mistral 7B",        description: "Reliable & fast fallback (free)" },
];

const OPENAI_MODELS: ModelInfo[] = [
  { id: "auto",          name: "Auto",          description: "Best available with automatic fallback" },
  { id: "gpt-4o-mini",   name: "GPT-4o mini",   description: "Fast & affordable" },
  { id: "gpt-4o",        name: "GPT-4o",        description: "Powerful & accurate" },
  { id: "gpt-4.1-mini",  name: "GPT-4.1 mini",  description: "Latest efficient model" },
  { id: "gpt-4.1",       name: "GPT-4.1",       description: "Latest powerful model" },
];

function getModels(): ModelInfo[] {
  try {
    return getProvider() === "openrouter" ? OPENROUTER_MODELS : OPENAI_MODELS;
  } catch {
    return OPENAI_MODELS;
  }
}

// Returns the chain of model IDs to try in order.
// "auto" → full chain. Specific model → that model first, then remaining chain as emergency fallback.
function buildFallbackChain(requestedModel: string): string[] {
  try {
    if (getProvider() === "openrouter") {
      const all = OPENROUTER_MODELS.filter((m) => m.id !== "auto").map((m) => m.id);
      if (requestedModel === "auto") return all;
      // Specific model: try it first, then the rest of the chain (skip duplicates)
      return [requestedModel, ...all.filter((id) => id !== requestedModel)];
    } else {
      const all = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
      if (requestedModel === "auto") return all;
      return [requestedModel, ...all.filter((id) => id !== requestedModel)];
    }
  } catch {
    return ["gpt-4o-mini"];
  }
}

// Decides whether an error from a model call is retryable (skip to next model).
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  // Always retry on capacity/availability errors
  if (msg.includes("no endpoints found")) return true;
  if (msg.includes("rate limit")) return true;
  if (msg.includes("overloaded")) return true;
  if (msg.includes("provider returned error")) return true;
  if (msg.includes("503") || msg.includes("502") || msg.includes("529")) return true;
  if (msg.includes("context length") || msg.includes("too many tokens")) return false; // not retryable
  // Default: retry on any HTTP error from free models
  return true;
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIResponse {
  choices: {
    message: { role: string; content: string | null; tool_calls?: OAIToolCall[] };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string; code?: string };
}

// ── Unified AI call ───────────────────────────────────────────────────────────

async function callAI(
  messages: OAIMessage[],
  tools: object[],
  model: string,
): Promise<OAIResponse> {
  const provider = getProvider();
  const apiKey   = getApiKey();

  const headers: Record<string, string> = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  let url: string;
  if (provider === "openrouter") {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers["HTTP-Referer"] = "https://joexads.repl.co";
    headers["X-Title"]      = "Joex Ads Dashboard";
  } else {
    url = "https://api.openai.com/v1/chat/completions";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools:       tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      max_tokens:  3000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as any;
      errMsg = errBody?.error?.message || errBody?.error?.code || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  const data = (await res.json()) as OAIResponse;
  if (data.error) throw new Error(data.error.message || data.error.code || "API error");
  return data;
}

const META_BASE = "https://graph.facebook.com/v22.0";

// ── Meta API helpers ───────────────────────────────────────────────────────────

async function metaGet(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<any> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(25_000) });
  return res.json();
}

async function metaPost(
  path: string,
  token: string,
  body: Record<string, any>,
): Promise<any> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

async function metaDelete(
  path: string,
  token: string,
): Promise<any> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

// ── Field constants ────────────────────────────────────────────────────────────

const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,cost_per_action_type,unique_clicks,outbound_clicks";

// ── Tool definitions ───────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, any>; required?: string[] };
}

function toOAITools(tools: ToolDef[]): object[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

const TOOLS: ToolDef[] = [

  // ── INSIGHTS & OVERVIEW ──────────────────────────────────────────────────────

  {
    name: "get_account_overview",
    description:
      "Get full account-level performance metrics: spend, ROAS, CTR, CPM, CPC, impressions, reach, clicks, frequency, purchases, leads. Always call this first for overall performance questions.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_breakdown",
    description:
      "Get performance breakdown by a specific dimension to find where spend is going and what's working.",
    input_schema: {
      type: "object" as const,
      properties: {
        breakdown: {
          type: "string",
          enum: ["device_platform", "publisher_platform", "country", "age", "gender", "impression_device"],
          description: "Dimension to analyze",
        },
      },
      required: ["breakdown"],
    },
  },
  {
    name: "get_daily_insights",
    description:
      "Get day-by-day performance data to identify trends, sudden drops, CPM spikes, or ROAS changes over time.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_account_info",
    description:
      "Get account balance, spend cap, amount spent, account status, and billing details.",
    input_schema: { type: "object" as const, properties: {} },
  },

  // ── CAMPAIGNS ────────────────────────────────────────────────────────────────

  {
    name: "get_campaigns",
    description:
      "Get ALL campaigns with complete performance data: name, ID, status, objective, budget, spend, ROAS, CTR, CPC, CPM, frequency, purchases. Use to identify top/bottom performers.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_campaign",
    description:
      "Create a new campaign. Specify name, objective, status, and optionally a daily or lifetime budget.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Campaign name" },
        objective: {
          type: "string",
          enum: ["OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_APP_PROMOTION"],
          description: "Campaign objective",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "PAUSED"],
          description: "Initial status (default PAUSED)",
        },
        daily_budget: { type: "number", description: "Daily budget in account currency (optional)" },
        lifetime_budget: { type: "number", description: "Lifetime budget in account currency (optional)" },
        special_ad_categories: {
          type: "array",
          items: { type: "string" },
          description: "Special ad categories if applicable (e.g. CREDIT, EMPLOYMENT, HOUSING). Pass empty array if none.",
        },
      },
      required: ["name", "objective"],
    },
  },
  {
    name: "pause_campaign",
    description:
      "PAUSE an active campaign. Use when ROAS is below breakeven, CPA is excessive, or budget is being wasted. Always provide a specific data-backed reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "Campaign ID to pause" },
        campaign_name: { type: "string", description: "Campaign name for display" },
        reason: { type: "string", description: "Specific data-backed reason" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "enable_campaign",
    description: "ACTIVATE a paused campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string" },
        campaign_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "set_campaign_budget",
    description:
      "Update a campaign's daily budget (in account currency). Scale winning campaigns or reduce budget on underperformers.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string" },
        campaign_name: { type: "string" },
        daily_budget: { type: "number", description: "New daily budget in account currency" },
        reason: { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "daily_budget", "reason"],
    },
  },
  {
    name: "delete_campaign",
    description:
      "PERMANENTLY DELETE a campaign. This is irreversible. Only use when explicitly requested.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string" },
        campaign_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "duplicate_campaign",
    description:
      "Duplicate an existing campaign. Creates an exact copy with all ad sets and ads. Useful for A/B testing or scaling a winner.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "Campaign ID to duplicate" },
        campaign_name: { type: "string", description: "Original campaign name (for display)" },
        copies: { type: "number", description: "Number of copies to create (default 1)" },
        status_override: {
          type: "string",
          enum: ["ACTIVE", "PAUSED", "INHERITED_FROM_SOURCE"],
          description: "Status for the copies (default PAUSED)",
        },
      },
      required: ["campaign_id", "campaign_name"],
    },
  },
  {
    name: "set_spend_cap",
    description:
      "Set or update the account-level spend cap. Prevents overspend by capping total account spend at a given amount. Set to 0 to remove the cap.",
    input_schema: {
      type: "object" as const,
      properties: {
        spend_cap: {
          type: "number",
          description: "Maximum total spend in account currency. Set to 0 to remove the cap.",
        },
        reason: { type: "string", description: "Why this cap is being set/changed" },
      },
      required: ["spend_cap", "reason"],
    },
  },

  // ── AD SETS ──────────────────────────────────────────────────────────────────

  {
    name: "get_adsets",
    description:
      "Get ALL ad sets with full metrics. Optionally filter by campaign. Returns budget, spend, ROAS, CTR, frequency, CPC, CPM.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "Optional: filter by campaign ID" },
      },
    },
  },
  {
    name: "create_adset",
    description:
      "Create a new ad set inside a campaign. Specify targeting, budget, billing event, and optimization goal.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "Parent campaign ID" },
        name: { type: "string", description: "Ad set name" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Initial status" },
        daily_budget: { type: "number", description: "Daily budget in account currency" },
        lifetime_budget: { type: "number", description: "Lifetime budget (mutually exclusive with daily_budget)" },
        billing_event: {
          type: "string",
          enum: ["IMPRESSIONS", "LINK_CLICKS", "APP_INSTALLS", "PAGE_LIKES", "POST_ENGAGEMENT", "VIDEO_VIEWS"],
          description: "Event billed on",
        },
        optimization_goal: {
          type: "string",
          enum: ["REACH", "LINK_CLICKS", "IMPRESSIONS", "LEAD_GENERATION", "CONVERSIONS", "LANDING_PAGE_VIEWS", "VALUE", "APP_INSTALLS", "VIDEO_VIEWS", "THRUPLAY"],
          description: "Optimization goal",
        },
        targeting: {
          type: "object",
          description: "Targeting spec object (geo_locations, age_min, age_max, genders, interests, etc.)",
        },
        start_time: { type: "string", description: "ISO 8601 start time (optional)" },
        end_time: { type: "string", description: "ISO 8601 end time (optional)" },
      },
      required: ["campaign_id", "name", "billing_event", "optimization_goal"],
    },
  },
  {
    name: "pause_adset",
    description:
      "PAUSE an active ad set. Use for ad sets with high frequency (>3.5), low CTR, or poor ROAS.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string" },
        adset_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["adset_id", "adset_name", "reason"],
    },
  },
  {
    name: "enable_adset",
    description: "ACTIVATE a paused ad set.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string" },
        adset_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["adset_id", "adset_name", "reason"],
    },
  },
  {
    name: "set_adset_budget",
    description: "Update an ad set's daily budget.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string" },
        adset_name: { type: "string" },
        daily_budget: { type: "number" },
        reason: { type: "string" },
      },
      required: ["adset_id", "adset_name", "daily_budget", "reason"],
    },
  },
  {
    name: "delete_adset",
    description: "PERMANENTLY DELETE an ad set. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string" },
        adset_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["adset_id", "adset_name", "reason"],
    },
  },

  // ── ADS ──────────────────────────────────────────────────────────────────────

  {
    name: "get_ads",
    description:
      "Get ALL individual ads with creative details (name, body, title) and performance metrics. Use to identify best/worst performing creatives.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string", description: "Optional: filter by ad set ID" },
      },
    },
  },
  {
    name: "create_ad",
    description:
      "Create a new ad inside an ad set. Requires an existing ad creative ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: { type: "string", description: "Parent ad set ID" },
        name: { type: "string", description: "Ad name" },
        creative_id: { type: "string", description: "Existing ad creative ID" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Initial status" },
      },
      required: ["adset_id", "name", "creative_id"],
    },
  },
  {
    name: "pause_ad",
    description: "PAUSE a specific ad.",
    input_schema: {
      type: "object" as const,
      properties: {
        ad_id: { type: "string" },
        ad_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ad_id", "ad_name", "reason"],
    },
  },
  {
    name: "enable_ad",
    description: "ACTIVATE a paused ad.",
    input_schema: {
      type: "object" as const,
      properties: {
        ad_id: { type: "string" },
        ad_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ad_id", "ad_name", "reason"],
    },
  },
  {
    name: "delete_ad",
    description: "PERMANENTLY DELETE an ad. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        ad_id: { type: "string" },
        ad_name: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ad_id", "ad_name", "reason"],
    },
  },

  // ── AD CREATIVES ─────────────────────────────────────────────────────────────

  {
    name: "get_adcreatives",
    description:
      "Get all ad creatives for the account. Returns creative ID, name, body, title, image/video URL, call to action.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_adcreative",
    description:
      "Create a new ad creative. Supports link ads, image ads, and video ads. Returns creative ID for use in create_ad.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Creative name" },
        object_story_spec: {
          type: "object",
          description: "Story spec: { page_id, link_data: { link, message, name, description, call_to_action, image_hash } } or { page_id, video_data: { video_id, title, message, call_to_action } }",
        },
        degrees_of_freedom_spec: {
          type: "object",
          description: "Optional: Advantage+ creative enhancements spec",
        },
      },
      required: ["name", "object_story_spec"],
    },
  },
  {
    name: "delete_adcreative",
    description: "DELETE an ad creative.",
    input_schema: {
      type: "object" as const,
      properties: {
        creative_id: { type: "string" },
        creative_name: { type: "string" },
      },
      required: ["creative_id", "creative_name"],
    },
  },

  // ── CUSTOM AUDIENCES ─────────────────────────────────────────────────────────

  {
    name: "get_customaudiences",
    description:
      "Get all custom audiences for the account: customer lists, website visitors, lookalikes, engagement audiences.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_lookalike",
    description:
      "Create a Lookalike Audience from an existing source audience (custom audience, pixel, page fans). Specify country and lookalike ratio (1%–10% — 1% is most similar).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for the lookalike audience" },
        origin_audience_id: { type: "string", description: "Source custom audience ID to base the lookalike on" },
        country: { type: "string", description: "Two-letter country code (e.g. US, GB, AE)" },
        ratio: {
          type: "number",
          description: "Lookalike ratio 0.01–0.10 (1%–10%). 0.01 = most similar, 0.10 = broadest reach.",
        },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name", "origin_audience_id", "country", "ratio"],
    },
  },
  {
    name: "create_customaudience",
    description:
      "Create a new custom audience (website visitors, customer list, engagement, or lookalike source).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Audience name" },
        subtype: {
          type: "string",
          enum: ["CUSTOM", "WEBSITE", "APP", "ENGAGEMENT", "LOOKALIKE", "PAGE_VISITS"],
          description: "Audience type",
        },
        description: { type: "string", description: "Description of the audience" },
        customer_file_source: {
          type: "string",
          enum: ["USER_PROVIDED_ONLY", "PARTNER_PROVIDED_ONLY", "BOTH_USER_AND_PARTNER_PROVIDED"],
          description: "Required for CUSTOM subtype",
        },
        retention_days: { type: "number", description: "Retention window in days for WEBSITE type (1–180)" },
        rule: { type: "string", description: "JSON-encoded rule for WEBSITE/ENGAGEMENT audiences" },
      },
      required: ["name", "subtype"],
    },
  },
  {
    name: "delete_customaudience",
    description: "PERMANENTLY DELETE a custom audience. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        audience_id: { type: "string" },
        audience_name: { type: "string" },
      },
      required: ["audience_id", "audience_name"],
    },
  },

  // ── AD IMAGES ────────────────────────────────────────────────────────────────

  {
    name: "get_adimages",
    description:
      "Get all ad images in the account. Returns image hash, name, width, height, URL, status.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "upload_adimage_by_url",
    description:
      "Upload an ad image from a public URL. Returns the image hash needed for creative creation.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Image name/label" },
        url: { type: "string", description: "Public HTTPS URL of the image to upload" },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "delete_adimage",
    description: "DELETE an ad image by hash.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_hash: { type: "string", description: "Image hash to delete" },
      },
      required: ["image_hash"],
    },
  },

  // ── AD VIDEOS ────────────────────────────────────────────────────────────────

  {
    name: "get_advideos",
    description:
      "Get all ad videos in the account. Returns video ID, title, length, thumbnails, status.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "delete_advideo",
    description: "DELETE an ad video from the account.",
    input_schema: {
      type: "object" as const,
      properties: {
        video_id: { type: "string" },
        video_title: { type: "string" },
      },
      required: ["video_id", "video_title"],
    },
  },

  // ── PIXELS ───────────────────────────────────────────────────────────────────

  {
    name: "get_adspixels",
    description:
      "Get all Meta Pixel (Ads Pixel) IDs for the account with creation date and last fired time.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_adspixel",
    description: "Create a new Meta Pixel for the account.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Pixel name" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_pixel_stats",
    description:
      "Get event stats (pageview, purchase, lead, add_to_cart, etc.) for a specific pixel with date-range breakdown.",
    input_schema: {
      type: "object" as const,
      properties: {
        pixel_id: { type: "string", description: "Pixel ID" },
      },
      required: ["pixel_id"],
    },
  },

  // ── AD RULES ─────────────────────────────────────────────────────────────────

  {
    name: "get_adrules",
    description:
      "Get all automated ad rules for the account: rule name, status, conditions, actions, schedule.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_adrule",
    description:
      "Create an automated ad rule that fires actions (pause, adjust budget, send notification) when conditions are met (ROAS below threshold, frequency too high, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Rule name" },
        evaluation_spec: {
          type: "object",
          description: "{ evaluation_type: 'SCHEDULE'|'TRIGGER', filters: [{field, value, operator}], schedule_spec: {schedule_type: 'SEMI_HOURLY'|'HOURLY'|'DAILY'|'WEEKLY'} }",
        },
        execution_spec: {
          type: "object",
          description: "{ execution_type: 'PAUSE'|'UNPAUSE'|'CHANGE_BUDGET'|'SEND_NOTIFICATION', execution_options: {...} }",
        },
        status: { type: "string", enum: ["ENABLED", "DISABLED"], description: "Rule status" },
      },
      required: ["name", "evaluation_spec", "execution_spec"],
    },
  },
  {
    name: "enable_adrule",
    description: "ENABLE an existing ad rule.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_id: { type: "string" },
        rule_name: { type: "string" },
      },
      required: ["rule_id", "rule_name"],
    },
  },
  {
    name: "disable_adrule",
    description: "DISABLE an existing ad rule.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_id: { type: "string" },
        rule_name: { type: "string" },
      },
      required: ["rule_id", "rule_name"],
    },
  },
  {
    name: "delete_adrule",
    description: "PERMANENTLY DELETE an ad rule. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        rule_id: { type: "string" },
        rule_name: { type: "string" },
      },
      required: ["rule_id", "rule_name"],
    },
  },

  // ── CUSTOM CONVERSIONS ───────────────────────────────────────────────────────

  {
    name: "get_customconversions",
    description:
      "Get all custom conversions for the account. Returns name, event type, pixel, conditions, and conversion stats.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_customconversion",
    description:
      "Create a new custom conversion based on URL rules or pixel events.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Custom conversion name" },
        pixel_id: { type: "string", description: "Associated pixel ID" },
        custom_event_type: {
          type: "string",
          enum: ["ADD_PAYMENT_INFO", "ADD_TO_CART", "ADD_TO_WISHLIST", "COMPLETE_REGISTRATION", "CONTENT_VIEW", "INITIATED_CHECKOUT", "LEAD", "PURCHASE", "SEARCH", "OTHER"],
          description: "Event type to track",
        },
        rule: {
          type: "string",
          description: "JSON-encoded URL rule e.g. {\"and\":[{\"url\":{\"i_contains\":\"thank-you\"}}]}",
        },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name", "pixel_id", "custom_event_type"],
    },
  },
  {
    name: "delete_customconversion",
    description: "PERMANENTLY DELETE a custom conversion. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        conversion_id: { type: "string" },
        conversion_name: { type: "string" },
      },
      required: ["conversion_id", "conversion_name"],
    },
  },

  // ── PRODUCT CATALOGS ─────────────────────────────────────────────────────────

  {
    name: "get_productcatalogs",
    description:
      "Get all product catalogs linked to the business. Returns catalog ID, name, product count, vertical.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_catalog_products",
    description:
      "Get products inside a specific catalog. Returns product ID, name, price, availability, URL, image.",
    input_schema: {
      type: "object" as const,
      properties: {
        catalog_id: { type: "string", description: "Catalog ID" },
        filter: { type: "string", description: "Optional: filter by availability (in stock, out of stock)" },
        limit: { type: "number", description: "Max results to return (default 50, max 200)" },
      },
      required: ["catalog_id"],
    },
  },
  {
    name: "delete_catalog_product",
    description: "DELETE a product from a catalog.",
    input_schema: {
      type: "object" as const,
      properties: {
        catalog_id: { type: "string" },
        product_id: { type: "string" },
        product_name: { type: "string" },
      },
      required: ["catalog_id", "product_id", "product_name"],
    },
  },
];

// ── Action tool classification ─────────────────────────────────────────────────

const ACTION_TOOLS = new Set([
  "create_campaign", "pause_campaign", "enable_campaign", "set_campaign_budget", "delete_campaign",
  "duplicate_campaign", "set_spend_cap",
  "create_adset", "pause_adset", "enable_adset", "set_adset_budget", "delete_adset",
  "create_ad", "pause_ad", "enable_ad", "delete_ad",
  "create_adcreative", "delete_adcreative",
  "create_lookalike", "create_customaudience", "delete_customaudience",
  "upload_adimage_by_url", "delete_adimage",
  "delete_advideo",
  "create_adspixel",
  "create_adrule", "enable_adrule", "disable_adrule", "delete_adrule",
  "create_customconversion", "delete_customconversion",
  "delete_catalog_product",
]);

// ── Tool call labels ──────────────────────────────────────────────────────────

function toolCallLabel(name: string, input: Record<string, any>): string {
  const labels: Record<string, () => string> = {
    get_account_overview:    () => "Fetching account performance overview…",
    get_breakdown:           () => `Fetching ${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown…`,
    get_daily_insights:      () => "Loading daily performance trends…",
    get_account_info:        () => "Fetching account balance & info…",
    get_campaigns:           () => "Loading all campaigns with insights…",
    create_campaign:         () => `Creating campaign: ${input.name}`,
    pause_campaign:          () => `Pausing campaign: ${input.campaign_name}`,
    enable_campaign:         () => `Enabling campaign: ${input.campaign_name}`,
    set_campaign_budget:     () => `Updating budget for: ${input.campaign_name}`,
    delete_campaign:         () => `Deleting campaign: ${input.campaign_name}`,
    duplicate_campaign:      () => `Duplicating campaign: ${input.campaign_name}`,
    set_spend_cap:           () => `Setting account spend cap to ${input.spend_cap}…`,
    get_adsets:              () => input.campaign_id ? `Loading ad sets for campaign ${input.campaign_id}…` : "Loading all ad sets…",
    create_adset:            () => `Creating ad set: ${input.name}`,
    pause_adset:             () => `Pausing ad set: ${input.adset_name}`,
    enable_adset:            () => `Enabling ad set: ${input.adset_name}`,
    set_adset_budget:        () => `Updating budget for: ${input.adset_name}`,
    delete_adset:            () => `Deleting ad set: ${input.adset_name}`,
    get_ads:                 () => input.adset_id ? `Loading ads for ad set ${input.adset_id}…` : "Loading all ads…",
    create_ad:               () => `Creating ad: ${input.name}`,
    pause_ad:                () => `Pausing ad: ${input.ad_name}`,
    enable_ad:               () => `Enabling ad: ${input.ad_name}`,
    delete_ad:               () => `Deleting ad: ${input.ad_name}`,
    get_adcreatives:         () => "Loading all ad creatives…",
    create_adcreative:       () => `Creating creative: ${input.name}`,
    delete_adcreative:       () => `Deleting creative: ${input.creative_name}`,
    get_customaudiences:     () => "Loading all custom audiences…",
    create_lookalike:        () => `Creating lookalike audience: ${input.name}`,
    create_customaudience:   () => `Creating audience: ${input.name}`,
    delete_customaudience:   () => `Deleting audience: ${input.audience_name}`,
    get_adimages:            () => "Loading all ad images…",
    upload_adimage_by_url:   () => `Uploading image: ${input.name}`,
    delete_adimage:          () => `Deleting image hash: ${input.image_hash}`,
    get_advideos:            () => "Loading all ad videos…",
    delete_advideo:          () => `Deleting video: ${input.video_title}`,
    get_adspixels:           () => "Loading all pixels…",
    create_adspixel:         () => `Creating pixel: ${input.name}`,
    get_pixel_stats:         () => `Fetching stats for pixel ${input.pixel_id}…`,
    get_adrules:             () => "Loading all ad rules…",
    create_adrule:           () => `Creating rule: ${input.name}`,
    enable_adrule:           () => `Enabling rule: ${input.rule_name}`,
    disable_adrule:          () => `Disabling rule: ${input.rule_name}`,
    delete_adrule:           () => `Deleting rule: ${input.rule_name}`,
    get_customconversions:   () => "Loading all custom conversions…",
    create_customconversion: () => `Creating conversion: ${input.name}`,
    delete_customconversion: () => `Deleting conversion: ${input.conversion_name}`,
    get_productcatalogs:     () => "Loading all product catalogs…",
    get_catalog_products:    () => `Loading products in catalog ${input.catalog_id}…`,
    delete_catalog_product:  () => `Deleting product ${input.product_name} from catalog…`,
  };
  return labels[name]?.() ?? `Running ${name}…`;
}

function toolDoneLabel(name: string, input: Record<string, any>, result: ToolResult): string {
  if (!result.success) return `Failed: ${result.error ?? "unknown error"}`;
  const count = (result.data as any)?.data?.length as number | undefined;
  const doneLabels: Record<string, () => string> = {
    get_account_overview:    () => "Account overview loaded",
    get_breakdown:           () => `${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown loaded`,
    get_daily_insights:      () => count != null ? `${count} days of data loaded` : "Daily data loaded",
    get_account_info:        () => "Account info loaded",
    get_campaigns:           () => count != null ? `${count} campaigns loaded` : "Campaigns loaded",
    create_campaign:         () => `Campaign "${input.name}" created`,
    pause_campaign:          () => `Campaign "${input.campaign_name}" paused`,
    enable_campaign:         () => `Campaign "${input.campaign_name}" enabled`,
    set_campaign_budget:     () => `Budget → ${input.daily_budget} for "${input.campaign_name}"`,
    delete_campaign:         () => `Campaign "${input.campaign_name}" deleted`,
    duplicate_campaign:      () => `Campaign "${input.campaign_name}" duplicated`,
    set_spend_cap:           () => input.spend_cap === 0 ? "Spend cap removed" : `Spend cap set to ${input.spend_cap}`,
    get_adsets:              () => count != null ? `${count} ad sets loaded` : "Ad sets loaded",
    create_adset:            () => `Ad set "${input.name}" created`,
    pause_adset:             () => `Ad set "${input.adset_name}" paused`,
    enable_adset:            () => `Ad set "${input.adset_name}" enabled`,
    set_adset_budget:        () => `Budget → ${input.daily_budget} for "${input.adset_name}"`,
    delete_adset:            () => `Ad set "${input.adset_name}" deleted`,
    get_ads:                 () => count != null ? `${count} ads loaded` : "Ads loaded",
    create_ad:               () => `Ad "${input.name}" created`,
    pause_ad:                () => `Ad "${input.ad_name}" paused`,
    enable_ad:               () => `Ad "${input.ad_name}" enabled`,
    delete_ad:               () => `Ad "${input.ad_name}" deleted`,
    get_adcreatives:         () => count != null ? `${count} creatives loaded` : "Creatives loaded",
    create_adcreative:       () => `Creative "${input.name}" created`,
    delete_adcreative:       () => `Creative "${input.creative_name}" deleted`,
    get_customaudiences:     () => count != null ? `${count} audiences loaded` : "Audiences loaded",
    create_lookalike:        () => `Lookalike audience "${input.name}" created`,
    create_customaudience:   () => `Audience "${input.name}" created`,
    delete_customaudience:   () => `Audience "${input.audience_name}" deleted`,
    get_adimages:            () => count != null ? `${count} images loaded` : "Images loaded",
    upload_adimage_by_url:   () => `Image "${input.name}" uploaded`,
    delete_adimage:          () => `Image ${input.image_hash} deleted`,
    get_advideos:            () => count != null ? `${count} videos loaded` : "Videos loaded",
    delete_advideo:          () => `Video "${input.video_title}" deleted`,
    get_adspixels:           () => count != null ? `${count} pixels loaded` : "Pixels loaded",
    create_adspixel:         () => `Pixel "${input.name}" created`,
    get_pixel_stats:         () => "Pixel stats loaded",
    get_adrules:             () => count != null ? `${count} rules loaded` : "Rules loaded",
    create_adrule:           () => `Rule "${input.name}" created`,
    enable_adrule:           () => `Rule "${input.rule_name}" enabled`,
    disable_adrule:          () => `Rule "${input.rule_name}" disabled`,
    delete_adrule:           () => `Rule "${input.rule_name}" deleted`,
    get_customconversions:   () => count != null ? `${count} conversions loaded` : "Conversions loaded",
    create_customconversion: () => `Conversion "${input.name}" created`,
    delete_customconversion: () => `Conversion "${input.conversion_name}" deleted`,
    get_productcatalogs:     () => count != null ? `${count} catalogs loaded` : "Catalogs loaded",
    get_catalog_products:    () => count != null ? `${count} products loaded` : "Products loaded",
    delete_catalog_product:  () => `Product "${input.product_name}" deleted`,
  };
  return doneLabels[name]?.() ?? "Done";
}

// ── Tool execution ─────────────────────────────────────────────────────────────

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function executeTool(
  name: string,
  input: Record<string, any>,
  token: string,
  accountId: string,
  since: string,
  until: string,
): Promise<ToolResult> {
  const dateParams: Record<string, string> =
    since && until
      ? { time_range: JSON.stringify({ since, until }) }
      : { date_preset: "last_30d" };

  try {
    switch (name) {

      // ── INSIGHTS ────────────────────────────────────────────────────────────

      case "get_account_overview": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          ...dateParams,
        });
        return { success: true, data };
      }

      case "get_breakdown": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: `${INSIGHT_FIELDS},${input.breakdown}`,
          breakdowns: input.breakdown,
          ...dateParams,
          limit: "50",
        });
        return { success: true, data };
      }

      case "get_daily_insights": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          time_increment: "1",
          ...dateParams,
        });
        return { success: true, data };
      }

      case "get_account_info": {
        const data = await metaGet(`/act_${accountId}`, token, {
          fields: "id,name,currency,balance,spend_cap,amount_spent,account_status,min_daily_budget",
        });
        return { success: true, data };
      }

      // ── CAMPAIGNS ──────────────────────────────────────────────────────────

      case "get_campaigns": {
        const data = await metaGet(`/act_${accountId}/campaigns`, token, {
          fields: `id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,insights{${INSIGHT_FIELDS}}`,
          ...dateParams,
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_campaign": {
        const body: Record<string, any> = {
          name: input.name,
          objective: input.objective,
          status: input.status ?? "PAUSED",
          special_ad_categories: input.special_ad_categories ?? [],
        };
        if (input.daily_budget)    body.daily_budget    = String(Math.round(Number(input.daily_budget) * 100));
        if (input.lifetime_budget) body.lifetime_budget = String(Math.round(Number(input.lifetime_budget) * 100));
        const data = await metaPost(`/act_${accountId}/campaigns`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "pause_campaign": {
        const data = await metaPost(`/${input.campaign_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Paused: ${input.campaign_name}` } };
      }

      case "enable_campaign": {
        const data = await metaPost(`/${input.campaign_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Enabled: ${input.campaign_name}` } };
      }

      case "set_campaign_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${input.campaign_id}`, token, { daily_budget: budgetCents });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Budget set: ${input.daily_budget}` } };
      }

      case "delete_campaign": {
        const data = await metaDelete(`/${input.campaign_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.campaign_name}` } };
      }

      case "duplicate_campaign": {
        const body: Record<string, any> = {
          copies: String(input.copies ?? 1),
          status_override: input.status_override ?? "PAUSED",
        };
        const data = await metaPost(`/${input.campaign_id}/copies`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "set_spend_cap": {
        const capValue = Number(input.spend_cap) === 0
          ? "0"
          : String(Math.round(Number(input.spend_cap) * 100));
        const data = await metaPost(`/act_${accountId}`, token, { spend_cap: capValue });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: Number(input.spend_cap) === 0 ? "Spend cap removed" : `Spend cap set to ${input.spend_cap}` } };
      }

      // ── AD SETS ────────────────────────────────────────────────────────────

      case "get_adsets": {
        const base = input.campaign_id
          ? `/${input.campaign_id}/adsets`
          : `/act_${accountId}/adsets`;
        const data = await metaGet(base, token, {
          fields: `id,name,status,campaign_id,daily_budget,lifetime_budget,insights{${INSIGHT_FIELDS}}`,
          ...dateParams,
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_adset": {
        const body: Record<string, any> = {
          campaign_id: input.campaign_id,
          name: input.name,
          status: input.status ?? "PAUSED",
          billing_event: input.billing_event,
          optimization_goal: input.optimization_goal,
        };
        if (input.daily_budget)    body.daily_budget    = String(Math.round(Number(input.daily_budget) * 100));
        if (input.lifetime_budget) body.lifetime_budget = String(Math.round(Number(input.lifetime_budget) * 100));
        if (input.targeting)       body.targeting       = typeof input.targeting === "string" ? input.targeting : JSON.stringify(input.targeting);
        if (input.start_time)      body.start_time      = input.start_time;
        if (input.end_time)        body.end_time        = input.end_time;
        const data = await metaPost(`/act_${accountId}/adsets`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "pause_adset": {
        const data = await metaPost(`/${input.adset_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Paused: ${input.adset_name}` } };
      }

      case "enable_adset": {
        const data = await metaPost(`/${input.adset_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Enabled: ${input.adset_name}` } };
      }

      case "set_adset_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${input.adset_id}`, token, { daily_budget: budgetCents });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Budget set: ${input.daily_budget}` } };
      }

      case "delete_adset": {
        const data = await metaDelete(`/${input.adset_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.adset_name}` } };
      }

      // ── ADS ───────────────────────────────────────────────────────────────

      case "get_ads": {
        const base = input.adset_id
          ? `/${input.adset_id}/ads`
          : `/act_${accountId}/ads`;
        const data = await metaGet(base, token, {
          fields: `id,name,status,adset_id,campaign_id,creative{id,name,body,title},insights{${INSIGHT_FIELDS}}`,
          ...dateParams,
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_ad": {
        const body: Record<string, any> = {
          adset_id: input.adset_id,
          name: input.name,
          creative: JSON.stringify({ creative_id: input.creative_id }),
          status: input.status ?? "PAUSED",
        };
        const data = await metaPost(`/act_${accountId}/ads`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "pause_ad": {
        const data = await metaPost(`/${input.ad_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Paused: ${input.ad_name}` } };
      }

      case "enable_ad": {
        const data = await metaPost(`/${input.ad_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Enabled: ${input.ad_name}` } };
      }

      case "delete_ad": {
        const data = await metaDelete(`/${input.ad_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.ad_name}` } };
      }

      // ── AD CREATIVES ──────────────────────────────────────────────────────

      case "get_adcreatives": {
        const data = await metaGet(`/act_${accountId}/adcreatives`, token, {
          fields: "id,name,body,title,object_story_spec,thumbnail_url,image_url,video_id,call_to_action_type",
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_adcreative": {
        const body: Record<string, any> = {
          name: input.name,
          object_story_spec: typeof input.object_story_spec === "string"
            ? input.object_story_spec
            : JSON.stringify(input.object_story_spec),
        };
        if (input.degrees_of_freedom_spec) {
          body.degrees_of_freedom_spec = typeof input.degrees_of_freedom_spec === "string"
            ? input.degrees_of_freedom_spec
            : JSON.stringify(input.degrees_of_freedom_spec);
        }
        const data = await metaPost(`/act_${accountId}/adcreatives`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "delete_adcreative": {
        const data = await metaDelete(`/${input.creative_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.creative_name}` } };
      }

      // ── CUSTOM AUDIENCES ──────────────────────────────────────────────────

      case "get_customaudiences": {
        const data = await metaGet(`/act_${accountId}/customaudiences`, token, {
          fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,data_source,time_created,time_updated,description",
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_lookalike": {
        const lookalike_spec = {
          origin: [{ id: input.origin_audience_id, type: "custom_audience" }],
          ratio: Number(input.ratio),
          country: input.country.toUpperCase(),
          type: "similarity",
        };
        const body: Record<string, any> = {
          name: input.name,
          subtype: "LOOKALIKE",
          lookalike_spec: JSON.stringify(lookalike_spec),
        };
        if (input.description) body.description = input.description;
        const data = await metaPost(`/act_${accountId}/customaudiences`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "create_customaudience": {
        const body: Record<string, any> = {
          name: input.name,
          subtype: input.subtype,
        };
        if (input.description)          body.description            = input.description;
        if (input.customer_file_source) body.customer_file_source   = input.customer_file_source;
        if (input.retention_days)       body.retention_days         = String(input.retention_days);
        if (input.rule)                 body.rule                   = input.rule;
        const data = await metaPost(`/act_${accountId}/customaudiences`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "delete_customaudience": {
        const data = await metaDelete(`/${input.audience_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.audience_name}` } };
      }

      // ── AD IMAGES ─────────────────────────────────────────────────────────

      case "get_adimages": {
        const data = await metaGet(`/act_${accountId}/adimages`, token, {
          fields: "hash,name,width,height,url,status,created_time",
          limit: "100",
        });
        return { success: true, data };
      }

      case "upload_adimage_by_url": {
        const body: Record<string, any> = {
          filename: input.name,
          url: input.url,
        };
        const data = await metaPost(`/act_${accountId}/adimages`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "delete_adimage": {
        const data = await metaPost(`/act_${accountId}/adimages`, token, {
          hash: input.image_hash,
        });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted image: ${input.image_hash}` } };
      }

      // ── AD VIDEOS ─────────────────────────────────────────────────────────

      case "get_advideos": {
        const data = await metaGet(`/act_${accountId}/advideos`, token, {
          fields: "id,title,description,length,thumbnails,status,created_time",
          limit: "100",
        });
        return { success: true, data };
      }

      case "delete_advideo": {
        const data = await metaDelete(`/${input.video_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.video_title}` } };
      }

      // ── PIXELS ────────────────────────────────────────────────────────────

      case "get_adspixels": {
        const data = await metaGet(`/act_${accountId}/adspixels`, token, {
          fields: "id,name,code,creation_time,last_fired_time,is_unavailable",
          limit: "50",
        });
        return { success: true, data };
      }

      case "create_adspixel": {
        const data = await metaPost(`/act_${accountId}/adspixels`, token, { name: input.name });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "get_pixel_stats": {
        const data = await metaGet(`/${input.pixel_id}/stats`, token, {
          aggregation: "event",
          ...dateParams,
        });
        return { success: true, data };
      }

      // ── AD RULES ──────────────────────────────────────────────────────────

      case "get_adrules": {
        const data = await metaGet(`/act_${accountId}/adrules`, token, {
          fields: "id,name,status,evaluation_spec,execution_spec,created_time",
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_adrule": {
        const body: Record<string, any> = {
          name: input.name,
          evaluation_spec: typeof input.evaluation_spec === "string"
            ? input.evaluation_spec
            : JSON.stringify(input.evaluation_spec),
          execution_spec: typeof input.execution_spec === "string"
            ? input.execution_spec
            : JSON.stringify(input.execution_spec),
          status: input.status ?? "ENABLED",
        };
        const data = await metaPost(`/act_${accountId}/adrules`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "enable_adrule": {
        const data = await metaPost(`/${input.rule_id}`, token, { status: "ENABLED" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Enabled rule: ${input.rule_name}` } };
      }

      case "disable_adrule": {
        const data = await metaPost(`/${input.rule_id}`, token, { status: "DISABLED" });
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Disabled rule: ${input.rule_name}` } };
      }

      case "delete_adrule": {
        const data = await metaDelete(`/${input.rule_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted rule: ${input.rule_name}` } };
      }

      // ── CUSTOM CONVERSIONS ────────────────────────────────────────────────

      case "get_customconversions": {
        const data = await metaGet(`/act_${accountId}/customconversions`, token, {
          fields: "id,name,custom_event_type,pixel,rule,creation_time,last_fired_time,stats",
          limit: "100",
        });
        return { success: true, data };
      }

      case "create_customconversion": {
        const body: Record<string, any> = {
          name: input.name,
          pixel_id: input.pixel_id,
          custom_event_type: input.custom_event_type,
        };
        if (input.rule)        body.rule        = input.rule;
        if (input.description) body.description = input.description;
        const data = await metaPost(`/act_${accountId}/customconversions`, token, body);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data };
      }

      case "delete_customconversion": {
        const data = await metaDelete(`/${input.conversion_id}`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted: ${input.conversion_name}` } };
      }

      // ── PRODUCT CATALOGS ──────────────────────────────────────────────────

      case "get_productcatalogs": {
        const meData = await metaGet("/me", token, {
          fields: "businesses{owned_product_catalogs{id,name,product_count,vertical,created_time}}",
        });
        return { success: true, data: meData };
      }

      case "get_catalog_products": {
        const limit = Math.min(Number(input.limit ?? 50), 200);
        const params: Record<string, string> = {
          fields: "id,name,price,sale_price,availability,url,image_url,brand,category,description",
          limit: String(limit),
        };
        if (input.filter) params.filter = input.filter;
        const data = await metaGet(`/${input.catalog_id}/products`, token, params);
        return { success: true, data };
      }

      case "delete_catalog_product": {
        const data = await metaDelete(`/${input.catalog_id}/batch`, token);
        if (data.error) return { success: false, error: String(data.error.message ?? JSON.stringify(data.error)) };
        return { success: true, data: { message: `Deleted product ${input.product_name}` } };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function trimData(data: unknown, maxItems = 80): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data)) {
    return { ...d, data: d.data.slice(0, maxItems) };
  }
  return data;
}

// ── Models endpoint ───────────────────────────────────────────────────────────

router.get("/ai/models", (_req, res): void => {
  try {
    const provider = getProvider();
    res.json({ provider, models: getModels() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "No API key configured" });
  }
});

// ── Main route ─────────────────────────────────────────────────────────────────

router.post("/ai/chat", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { messages, context, model: requestedModel = "auto" } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    model?: string;
    context?: {
      accountId?: string;
      accountName?: string;
      currency?: string;
      since?: string;
      until?: string;
    };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const accountId = context?.accountId
    ? String(context.accountId).replace(/^act_/, "")
    : "";
  const since = context?.since ?? "";
  const until = context?.until ?? "";
  const currency = context?.currency ?? "USD";
  const accountName = context?.accountName ?? "this account";

  const systemPrompt = `You are JOEX AI — an elite Meta Ads AI agent with FULL LIVE ACCESS to the ad account data and the ability to execute real actions across the entire Meta Marketing API.

ACCOUNT:
- Name: ${accountName}${accountId ? ` (act_${accountId})` : ""}
- Currency: ${currency}
- Date range: ${since || "not set"} → ${until || "not set"}

PERMISSIONS & SCOPES:
ads_management, ads_read, business_management, pages_manage_ads, pages_read_engagement,
instagram_basic, instagram_manage_insights, catalog_management, leads_retrieval,
pages_manage_metadata, instagram_content_publish, pages_manage_posts, pages_show_list,
read_insights, publish_video

YOUR CAPABILITIES:

READ TOOLS (always fetch fresh data before recommending):
- get_account_overview → total spend, ROAS, CTR, CPM, CPC, impressions, reach, purchases
- get_breakdown → performance by device, platform, country, age, gender
- get_daily_insights → day-by-day trends
- get_account_info → balance, billing, account status
- get_campaigns → all campaigns with full performance metrics
- get_adsets → all ad sets with budgets, ROAS, frequency
- get_ads → all ads with creative info and performance
- get_adcreatives → all creative assets (image, video, copy)
- get_customaudiences → customer lists, lookalikes, website visitors
- get_adimages → all uploaded image assets with hashes
- get_advideos → all uploaded video assets
- get_adspixels → all Meta Pixels with last-fired times
- get_pixel_stats → event breakdown for a specific pixel
- get_adrules → all automated rules with conditions and actions
- get_customconversions → custom conversion events and stats
- get_productcatalogs → product catalogs linked to the business
- get_catalog_products → products inside a specific catalog

ACTION TOOLS (execute real changes — always confirm what you did and why):
Campaigns:   create_campaign, pause_campaign, enable_campaign, set_campaign_budget, delete_campaign
Ad Sets:     create_adset, pause_adset, enable_adset, set_adset_budget, delete_adset
Ads:         create_ad, pause_ad, enable_ad, delete_ad
Creatives:   create_adcreative, delete_adcreative
Audiences:   create_customaudience, delete_customaudience
Images:      upload_adimage_by_url, delete_adimage
Videos:      delete_advideo
Pixels:      create_adspixel
Rules:       create_adrule, enable_adrule, disable_adrule, delete_adrule
Conversions: create_customconversion, delete_customconversion
Catalogs:    delete_catalog_product

OPERATING RULES:
- ALWAYS call read tools to get live data before making recommendations — never guess
- For optimization requests: fetch campaigns + adsets + relevant breakdowns first
- Reference actual names, IDs, and numbers from the data in every response
- For actions: state exactly what you did and why, citing specific metrics
- Prioritize by revenue impact (highest ROI first)
- Be direct and specific — no generic advice
- Full audit: call get_account_overview, get_campaigns, get_adsets, get_daily_insights
- DELETE operations are irreversible: always confirm the object name and reason
- For budget changes: always state the old and new value`;

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const emit = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  try {
    const oaiTools = accountId ? toOAITools(TOOLS) : [];

    let currentMessages: OAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const fallbackChain = buildFallbackChain(requestedModel);
    let currentModel: string = fallbackChain[0];
    let modelIndex = 0;
    const tokensTotal = { prompt: 0, completion: 0, total: 0 };
    const startTime = Date.now();

    emit({ type: "model", model: currentModel });

    // Agentic loop — max 5 iterations
    for (let iter = 0; iter < 5; iter++) {
      let response: OAIResponse | null = null;

      // Try fallback chain starting from current model index
      let lastErr: unknown;
      for (let mi = modelIndex; mi < fallbackChain.length; mi++) {
        try {
          response = await callAI(currentMessages, oaiTools, fallbackChain[mi]);
          if (mi !== modelIndex) {
            const prevModel = currentModel;
            currentModel = fallbackChain[mi];
            modelIndex = mi;
            emit({ type: "fallback", from: prevModel, to: currentModel, model: currentModel });
          }
          break;
        } catch (err) {
          lastErr = err;
          const retryable = isRetryableError(err);
          const isLast = mi === fallbackChain.length - 1;
          if (!retryable || isLast) {
            // Emit which model failed so frontend can show it
            emit({ type: "model_error", model: fallbackChain[mi], error: err instanceof Error ? err.message : String(err) });
            if (isLast) break;
            // Non-retryable but not last: still throw
            throw err;
          }
          // Retryable: emit notification and move to next model silently
          if (!isLast) {
            emit({ type: "model_error", model: fallbackChain[mi], error: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      if (!response) {
        const errMsg = lastErr instanceof Error ? lastErr.message : "All models unavailable";
        throw new Error(`All models failed. Last error: ${errMsg}`);
      }

      if (response.usage) {
        tokensTotal.prompt     += response.usage.prompt_tokens;
        tokensTotal.completion += response.usage.completion_tokens;
        tokensTotal.total      += response.usage.total_tokens;
      }

      const choice  = response.choices[0];
      const message = choice.message;
      const finish  = choice.finish_reason;

      // Stream text content in small chunks
      if (message.content) {
        const chunkSize = 4;
        for (let i = 0; i < message.content.length; i += chunkSize) {
          emit({ content: message.content.slice(i, i + chunkSize) });
        }
      }

      if (!message.tool_calls?.length || finish === "stop") {
        break;
      }

      // Add assistant turn with tool_calls to history
      currentMessages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });

      // Execute each tool call sequentially
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let toolInput: Record<string, any> = {};
        try { toolInput = JSON.parse(toolCall.function.arguments || "{}"); } catch {}

        const isAction = ACTION_TOOLS.has(toolName);

        emit({ type: "tool_call", tool: toolName, label: toolCallLabel(toolName, toolInput), isAction, input: toolInput });

        const result = await executeTool(toolName, toolInput, token, accountId, since, until);

        emit({ type: "tool_done", tool: toolName, label: toolDoneLabel(toolName, toolInput, result), isAction, success: result.success, error: result.error, input: toolInput });

        currentMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.success
            ? JSON.stringify(trimData(result.data))
            : JSON.stringify({ error: result.error }),
        });
      }
    }

    const duration = Date.now() - startTime;
    emit({ done: true, model: currentModel, tokens: tokensTotal, duration });
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    emit({ error: msg });
    res.end();
  }
});

export default router;
