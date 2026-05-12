import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// ── Anthropic client ──────────────────────────────────────────────────────────
// Inline the client here so we don't depend on the unbuilt composite lib.

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey) throw new Error("AI_INTEGRATIONS_ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

// ── Meta API helpers ──────────────────────────────────────────────────────────

const META_BASE = "https://graph.facebook.com/v22.0";

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
  body: Record<string, string>,
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

// ── Field helpers ─────────────────────────────────────────────────────────────

const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,cost_per_action_type,unique_clicks,outbound_clicks";

/**
 * Builds the CORRECT Meta Graph API inline field parameter for nested insights.
 * Syntax: insights.time_range({"since":"...","until":"..."}){fields}
 *         OR insights.date_preset(last_30d){fields}
 *
 * This is NOT the same as the top-level ?time_range= query param.
 * Passing time_range as a separate query param does NOT filter nested insights edges.
 */
function insightParam(since: string, until: string): string {
  if (since && until) {
    return `.time_range(${JSON.stringify({ since, until })})`;
  }
  return `.date_preset(last_30d)`;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_account_overview",
    description:
      "Get full account-level performance metrics: spend, ROAS, CTR, CPM, CPC, impressions, reach, clicks, frequency, purchases, leads, revenue. Always call this first when asked about overall performance.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_campaigns",
    description:
      "Get ALL campaigns with complete performance data including name, ID, status, objective, budget (daily/lifetime), spend, ROAS, CTR, CPC, CPM, frequency, purchases. Use to identify top/bottom performers.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_adsets",
    description:
      "Get ALL ad sets with full metrics. Optionally filter by campaign. Returns budget, spend, ROAS, CTR, frequency, CPC, CPM, targeting summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "Optional: filter by campaign ID to get only that campaign's ad sets",
        },
      },
    },
  },
  {
    name: "get_ads",
    description:
      "Get ALL individual ads with creative details (name, body, title) and performance metrics. Use to identify best/worst performing creatives.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id: {
          type: "string",
          description: "Optional: filter by ad set ID",
        },
      },
    },
  },
  {
    name: "get_breakdown",
    description:
      "Get performance breakdown by a specific dimension to find where spend is going and what's working. Essential for optimization. Use device_platform, publisher_platform, or country — those are reliably available for all accounts.",
    input_schema: {
      type: "object" as const,
      properties: {
        breakdown: {
          type: "string",
          enum: [
            "device_platform",
            "publisher_platform",
            "country",
            "impression_device",
            "age",
            "gender",
          ],
          description: "Dimension to analyze. Prefer device_platform, publisher_platform, country. age/gender may not be available for all accounts.",
        },
      },
      required: ["breakdown"],
    },
  },
  {
    name: "get_daily_insights",
    description:
      "Get day-by-day performance data to identify trends, sudden drops, CPM spikes, or ROAS improvements over the selected period.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_account_info",
    description:
      "Get account balance, spend cap, amount spent to date, account status, currency, and billing info.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "pause_campaign",
    description:
      "PAUSE an active campaign. Use when a campaign has poor ROAS below breakeven, excessive CPA, or is clearly wasting budget. Always provide a specific data-backed reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string", description: "Campaign ID to pause" },
        campaign_name: { type: "string", description: "Campaign name for confirmation" },
        reason: { type: "string", description: "Specific data-backed reason (e.g. 'ROAS 0.6x after $500 spend')" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "enable_campaign",
    description: "ACTIVATE a paused campaign. Use when conditions have improved or testing a previously paused campaign.",
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
      "Update a campaign's daily budget (in account currency). Scale up winning campaigns or reduce budget on underperformers.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: { type: "string" },
        campaign_name: { type: "string" },
        daily_budget: {
          type: "number",
          description: "New daily budget amount in account currency (e.g. 500 for 500 EGP)",
        },
        reason: { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "daily_budget", "reason"],
    },
  },
  {
    name: "pause_adset",
    description:
      "PAUSE an active ad set. Use for ad sets with high frequency (>3.5), low CTR, poor ROAS, or audience exhaustion signs.",
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
    description: "Update an ad set's daily budget. Use for ABO campaigns.",
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
];

const ACTION_TOOLS = new Set([
  "pause_campaign",
  "enable_campaign",
  "set_campaign_budget",
  "pause_adset",
  "enable_adset",
  "set_adset_budget",
]);

// ── Tool labels ────────────────────────────────────────────────────────────────

function toolCallLabel(name: string, input: Record<string, any>): string {
  switch (name) {
    case "get_account_overview": return "Fetching account performance overview…";
    case "get_campaigns":        return "Loading all campaigns with insights…";
    case "get_adsets":           return input.campaign_id ? `Loading ad sets for campaign ${input.campaign_id}…` : "Loading all ad sets…";
    case "get_ads":              return input.adset_id ? `Loading ads for ad set ${input.adset_id}…` : "Loading all ads…";
    case "get_breakdown":        return `Fetching ${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown…`;
    case "get_daily_insights":   return "Loading daily performance trends…";
    case "get_account_info":     return "Fetching account balance & info…";
    case "pause_campaign":       return `Pausing campaign: ${input.campaign_name}`;
    case "enable_campaign":      return `Enabling campaign: ${input.campaign_name}`;
    case "set_campaign_budget":  return `Updating budget for: ${input.campaign_name}`;
    case "pause_adset":          return `Pausing ad set: ${input.adset_name}`;
    case "enable_adset":         return `Enabling ad set: ${input.adset_name}`;
    case "set_adset_budget":     return `Updating budget for: ${input.adset_name}`;
    default:                     return `Running ${name}…`;
  }
}

function toolDoneLabel(name: string, input: Record<string, any>, result: any): string {
  if (!result.success) return `Failed: ${result.error ?? "unknown error"}`;
  const count = result.data?.data?.length;
  switch (name) {
    case "get_account_overview": return "Account overview loaded";
    case "get_campaigns":        return count != null ? `${count} campaigns loaded` : "Campaigns loaded";
    case "get_adsets":           return count != null ? `${count} ad sets loaded` : "Ad sets loaded";
    case "get_ads":              return count != null ? `${count} ads loaded` : "Ads loaded";
    case "get_breakdown":        return `${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown loaded`;
    case "get_daily_insights":   return count != null ? `${count} days of data loaded` : "Daily data loaded";
    case "get_account_info":     return "Account info loaded";
    case "pause_campaign":       return `Campaign "${input.campaign_name}" paused`;
    case "enable_campaign":      return `Campaign "${input.campaign_name}" enabled`;
    case "set_campaign_budget":  return `Budget set to ${input.daily_budget} for "${input.campaign_name}"`;
    case "pause_adset":          return `Ad set "${input.adset_name}" paused`;
    case "enable_adset":         return `Ad set "${input.adset_name}" enabled`;
    case "set_adset_budget":     return `Budget set to ${input.daily_budget} for "${input.adset_name}"`;
    default: return "Done";
  }
}

// ── Tool execution ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, any>,
  token: string,
  accountId: string,
  since: string,
  until: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  // For top-level insights endpoint: use query params
  const dateQueryParams: Record<string, string> = since && until
    ? { time_range: JSON.stringify({ since, until }) }
    : { date_preset: "last_30d" };

  // For nested insights in field expansion: use inline dot-param syntax
  const dp = insightParam(since, until);

  try {
    switch (name) {
      case "get_account_overview": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          ...dateQueryParams,
        });
        return { success: true, data };
      }

      case "get_campaigns": {
        // CORRECT: insights.time_range({...}){fields} or insights.date_preset(last_30d){fields}
        const data = await metaGet(`/act_${accountId}/campaigns`, token, {
          fields: `id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,insights${dp}{${INSIGHT_FIELDS}}`,
          limit: "100",
        });
        return { success: true, data };
      }

      case "get_adsets": {
        const base = input.campaign_id
          ? `/${String(input.campaign_id)}/adsets`
          : `/act_${accountId}/adsets`;
        const data = await metaGet(base, token, {
          fields: `id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,insights${dp}{${INSIGHT_FIELDS}}`,
          limit: "100",
        });
        return { success: true, data };
      }

      case "get_ads": {
        const base = input.adset_id
          ? `/${String(input.adset_id)}/ads`
          : `/act_${accountId}/ads`;
        const data = await metaGet(base, token, {
          fields: `id,name,status,adset_id,campaign_id,creative{id,name,body,title,image_url,call_to_action_type},insights${dp}{${INSIGHT_FIELDS}}`,
          limit: "100",
        });
        return { success: true, data };
      }

      case "get_breakdown": {
        const bd = String(input.breakdown ?? "country");
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          breakdowns: bd,
          ...dateQueryParams,
          limit: "50",
        });
        // If the API returns an error (e.g. age/gender not available), relay it gracefully
        if ((data as any)?.error) {
          return {
            success: false,
            error: `Meta API error for breakdown "${bd}": ${(data as any).error.message ?? JSON.stringify((data as any).error)}. Try a different breakdown dimension like device_platform or country.`,
          };
        }
        return { success: true, data };
      }

      case "get_daily_insights": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          time_increment: "1",
          ...dateQueryParams,
        });
        return { success: true, data };
      }

      case "get_account_info": {
        const data = await metaGet(`/act_${accountId}`, token, {
          fields: "id,name,currency,balance,spend_cap,amount_spent,account_status,business,min_daily_budget,timezone_name",
        });
        return { success: true, data };
      }

      case "pause_campaign": {
        const data = await metaPost(`/${String(input.campaign_id)}`, token, { status: "PAUSED" });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Campaign "${input.campaign_name}" paused successfully`, id: input.campaign_id } };
      }

      case "enable_campaign": {
        const data = await metaPost(`/${String(input.campaign_id)}`, token, { status: "ACTIVE" });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Campaign "${input.campaign_name}" enabled`, id: input.campaign_id } };
      }

      case "set_campaign_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${String(input.campaign_id)}`, token, { daily_budget: budgetCents });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Daily budget set to ${input.daily_budget} for "${input.campaign_name}"`, id: input.campaign_id } };
      }

      case "pause_adset": {
        const data = await metaPost(`/${String(input.adset_id)}`, token, { status: "PAUSED" });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Ad set "${input.adset_name}" paused`, id: input.adset_id } };
      }

      case "enable_adset": {
        const data = await metaPost(`/${String(input.adset_id)}`, token, { status: "ACTIVE" });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Ad set "${input.adset_name}" enabled`, id: input.adset_id } };
      }

      case "set_adset_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${String(input.adset_id)}`, token, { daily_budget: budgetCents });
        if ((data as any).error) return { success: false, error: (data as any).error.message ?? JSON.stringify((data as any).error) };
        return { success: true, data: { message: `Daily budget set to ${input.daily_budget} for "${input.adset_name}"`, id: input.adset_id } };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

function trimData(data: any, maxItems = 80): any {
  if (!data) return data;
  if (data.data && Array.isArray(data.data)) {
    return { ...data, data: data.data.slice(0, maxItems) };
  }
  return data;
}

// ── Main agent route ──────────────────────────────────────────────────────────

router.post("/ai/chat", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized — missing X-Meta-Token" });
    return;
  }

  const { messages, context } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
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

  let anthropic: Anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch (err: any) {
    res.status(503).json({ error: `AI not configured: ${err?.message}` });
    return;
  }

  const systemPrompt = `You are JOEX AI — an elite Meta Ads AI agent with FULL LIVE ACCESS to the ad account data and the ability to execute real actions.

ACCOUNT:
- Name: ${accountName}${accountId ? ` (act_${accountId})` : ""}
- Currency: ${currency}
- Date range: ${since || "not set"} → ${until || "not set"}

YOUR CAPABILITIES:
1. LIVE DATA TOOLS — always fetch fresh data before giving recommendations:
   - get_account_overview → total spend, ROAS, CTR, CPM, CPC, impressions, reach, purchases
   - get_campaigns → all campaigns with full performance metrics
   - get_adsets → all ad sets with budgets, ROAS, frequency
   - get_ads → all ads with creative info and performance
   - get_breakdown → performance by device_platform, publisher_platform, country, impression_device (prefer these; age/gender may not be available for all accounts)
   - get_daily_insights → day-by-day trends
   - get_account_info → balance, billing, account status, currency

2. ACTION TOOLS — execute real changes on the Meta account:
   - pause_campaign / enable_campaign → toggle campaign status
   - set_campaign_budget → update daily budget (in ${currency})
   - pause_adset / enable_adset → toggle ad set status
   - set_adset_budget → update ad set daily budget

RULES:
- ALWAYS call tools to get live data before making recommendations
- For optimization requests: fetch campaigns AND adsets AND relevant breakdowns
- Reference actual names, IDs, and numbers from the data — no generic advice
- For actions: state exactly what you did and why with specific metrics
- Prioritize by revenue impact (highest ROI first)
- If a breakdown fails (age/gender not available), note it and try device or country instead
- If asked to "analyze everything" or "full audit": call get_account_overview + get_campaigns + get_adsets + get_daily_insights
- When taking actions, confirm each action with the specific metric that justified it
- Format currency amounts with the account currency (${currency})`;

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const emit = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore write errors — client disconnected
    }
  };

  try {
    let currentMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const tools = accountId ? TOOLS : [];

    // Agentic loop — max 12 tool-calling iterations
    for (let iter = 0; iter < 12; iter++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

      // Stream any text blocks in small chunks for a smooth typing effect
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          const chunkSize = 6;
          for (let i = 0; i < block.text.length; i += chunkSize) {
            emit({ content: block.text.slice(i, i + chunkSize) });
          }
        }
      }

      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const input = toolUse.input as Record<string, any>;
          const isAction = ACTION_TOOLS.has(toolUse.name);

          emit({
            type: "tool_call",
            tool: toolUse.name,
            label: toolCallLabel(toolUse.name, input),
            isAction,
            input,
          });

          const result = await executeTool(
            toolUse.name,
            input,
            token,
            accountId,
            since,
            until,
          );

          const trimmed = trimData(result.data);

          emit({
            type: "tool_done",
            tool: toolUse.name,
            label: toolDoneLabel(toolUse.name, input, result),
            isAction,
            success: result.success,
            error: result.error,
            input,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.success
              ? JSON.stringify(trimmed ?? {})
              : JSON.stringify({ error: result.error }),
          });
        }

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
      } else {
        break;
      }
    }

    emit({ done: true });
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    emit({ error: msg });
    res.end();
  }
});

export default router;
