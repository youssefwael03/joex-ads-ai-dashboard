import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const META_BASE = "https://graph.facebook.com/v22.0";

// ── Meta API helpers ──────────────────────────────────────────────────────────

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

// ── Tool definitions ──────────────────────────────────────────────────────────

const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,cost_per_action_type,unique_clicks,outbound_clicks";

type AnthropicTool = Parameters<typeof anthropic.messages.create>[0]["tools"] extends (infer T)[] | undefined ? T : never;

const TOOLS: AnthropicTool[] = [
  {
    name: "get_account_overview",
    description:
      "Get full account-level performance metrics: spend, ROAS, CTR, CPM, CPC, impressions, reach, clicks, frequency, purchases, leads. Always call this first for overall performance questions.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_campaigns",
    description:
      "Get ALL campaigns with complete performance data: name, ID, status, objective, budget, spend, ROAS, CTR, CPC, CPM, frequency, purchases. Use to identify top/bottom performers.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_adsets",
    description:
      "Get ALL ad sets with full metrics. Optionally filter by campaign. Returns budget, spend, ROAS, CTR, frequency, CPC, CPM.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id: {
          type: "string",
          description: "Optional: filter by campaign ID",
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
      "Get performance breakdown by a specific dimension to find where spend is going and what's working.",
    input_schema: {
      type: "object" as const,
      properties: {
        breakdown: {
          type: "string",
          enum: [
            "device_platform",
            "publisher_platform",
            "country",
            "age",
            "gender",
            "impression_device",
          ],
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
        daily_budget: {
          type: "number",
          description: "New daily budget in account currency",
        },
        reason: { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "daily_budget", "reason"],
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
];

const ACTION_TOOLS = new Set([
  "pause_campaign",
  "enable_campaign",
  "set_campaign_budget",
  "pause_adset",
  "enable_adset",
  "set_adset_budget",
]);

// ── Labels ────────────────────────────────────────────────────────────────────

function toolCallLabel(name: string, input: Record<string, any>): string {
  switch (name) {
    case "get_account_overview": return "Fetching account performance overview…";
    case "get_campaigns": return "Loading all campaigns with insights…";
    case "get_adsets": return input.campaign_id
      ? `Loading ad sets for campaign ${input.campaign_id}…`
      : "Loading all ad sets…";
    case "get_ads": return input.adset_id
      ? `Loading ads for ad set ${input.adset_id}…`
      : "Loading all ads…";
    case "get_breakdown": return `Fetching ${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown…`;
    case "get_daily_insights": return "Loading daily performance trends…";
    case "get_account_info": return "Fetching account balance & info…";
    case "pause_campaign": return `Pausing campaign: ${input.campaign_name}`;
    case "enable_campaign": return `Enabling campaign: ${input.campaign_name}`;
    case "set_campaign_budget": return `Updating budget for: ${input.campaign_name}`;
    case "pause_adset": return `Pausing ad set: ${input.adset_name}`;
    case "enable_adset": return `Enabling ad set: ${input.adset_name}`;
    case "set_adset_budget": return `Updating budget for: ${input.adset_name}`;
    default: return `Running ${name}…`;
  }
}

function toolDoneLabel(name: string, input: Record<string, any>, result: ToolResult): string {
  if (!result.success) return `Failed: ${result.error ?? "unknown error"}`;
  const count = (result.data as any)?.data?.length as number | undefined;
  switch (name) {
    case "get_account_overview": return "Account overview loaded";
    case "get_campaigns": return count != null ? `${count} campaigns loaded` : "Campaigns loaded";
    case "get_adsets": return count != null ? `${count} ad sets loaded` : "Ad sets loaded";
    case "get_ads": return count != null ? `${count} ads loaded` : "Ads loaded";
    case "get_breakdown": return `${String(input.breakdown ?? "").replace(/_/g, " ")} breakdown loaded`;
    case "get_daily_insights": return count != null ? `${count} days of data loaded` : "Daily data loaded";
    case "get_account_info": return "Account info loaded";
    case "pause_campaign": return `Campaign "${input.campaign_name}" paused`;
    case "enable_campaign": return `Campaign "${input.campaign_name}" enabled`;
    case "set_campaign_budget": return `Budget → ${input.daily_budget} for "${input.campaign_name}"`;
    case "pause_adset": return `Ad set "${input.adset_name}" paused`;
    case "enable_adset": return `Ad set "${input.adset_name}" enabled`;
    case "set_adset_budget": return `Budget → ${input.daily_budget} for "${input.adset_name}"`;
    default: return "Done";
  }
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
      case "get_account_overview": {
        const data = await metaGet(`/act_${accountId}/insights`, token, {
          fields: INSIGHT_FIELDS,
          ...dateParams,
        });
        return { success: true, data };
      }

      case "get_campaigns": {
        const data = await metaGet(`/act_${accountId}/campaigns`, token, {
          fields: `id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,insights{${INSIGHT_FIELDS}}`,
          ...dateParams,
          limit: "100",
        });
        return { success: true, data };
      }

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

// ── Main route ────────────────────────────────────────────────────────────────

router.post("/ai/chat", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
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
   - get_breakdown → performance by device, platform, country, age, gender
   - get_daily_insights → day-by-day trends
   - get_account_info → balance, billing, account status

2. ACTION TOOLS — execute real changes on the Meta account:
   - pause_campaign / enable_campaign → toggle campaign status
   - set_campaign_budget → update daily budget (in ${currency})
   - pause_adset / enable_adset → toggle ad set status
   - set_adset_budget → update ad set daily budget

RULES:
- ALWAYS call tools to get live data before making recommendations — never guess
- For optimization requests: fetch campaigns AND adsets AND relevant breakdowns
- Reference actual names, IDs, and numbers from the data
- For actions: state exactly what you did and why with specific metrics
- Prioritize by revenue impact (highest ROI first)
- Be direct and specific — no generic advice
- "Full audit": call get_account_overview, get_campaigns, get_adsets, get_daily_insights
- When taking actions, confirm each one with the specific metric that justified it`;

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
    type MessageParam = Parameters<typeof anthropic.messages.create>[0]["messages"][number];
    let currentMessages: MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const tools = accountId ? TOOLS : [];

    // Agentic loop — max 12 iterations
    for (let iter = 0; iter < 12; iter++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

      // Stream text blocks in small chunks
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          const chunkSize = 4;
          for (let i = 0; i < block.text.length; i += chunkSize) {
            emit({ content: block.text.slice(i, i + chunkSize) });
          }
        }
      }

      if (response.stop_reason === "end_turn") {
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
        );

        const toolResults: MessageParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const input = (toolUse.input ?? {}) as Record<string, any>;
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
            role: "user",
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: toolUse.id,
                content: result.success
                  ? JSON.stringify(trimData(result.data))
                  : JSON.stringify({ error: result.error }),
              },
            ],
          });
        }

        // Continue loop with results
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          ...toolResults,
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
