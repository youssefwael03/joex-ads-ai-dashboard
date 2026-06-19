import { Router, type IRouter } from "express";
import { db, accountBrains } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTemplate, listTemplates, buildNamingConvention } from "../templates/campaigns";
import {
  callWithFallback,
  callProvider,
  getProviderStatus,
  type AIMessage,
  type ProviderName,
} from "../providers";

const router: IRouter = Router();

// ── Account Brain ─────────────────────────────────────────────────────────────

interface BrainData {
  auditSummary?: string;
  kpiSnapshot?: Record<string, any>;
  winningCampaigns?: any[];
  losingCampaigns?: any[];
  audienceInsights?: Record<string, any>;
  creativeInsights?: Record<string, any>;
  scalingInsights?: Record<string, any>;
  recommendations?: any[];
  fatigueInfo?: Record<string, any>;
  lastDateRange?: string;
}

type BrainRow = BrainData & { updatedAt: Date };

async function loadBrain(accountId: string): Promise<BrainRow | null> {
  try {
    const rows = await db.select().from(accountBrains)
      .where(eq(accountBrains.accountId, accountId))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      auditSummary:     r.auditSummary      ?? undefined,
      kpiSnapshot:      r.kpiSnapshot       as Record<string, any> ?? undefined,
      winningCampaigns: r.winningCampaigns  as any[]               ?? undefined,
      losingCampaigns:  r.losingCampaigns   as any[]               ?? undefined,
      audienceInsights: r.audienceInsights  as Record<string, any> ?? undefined,
      creativeInsights: r.creativeInsights  as Record<string, any> ?? undefined,
      scalingInsights:  r.scalingInsights   as Record<string, any> ?? undefined,
      recommendations:  r.recommendations   as any[]               ?? undefined,
      fatigueInfo:      r.fatigueInfo       as Record<string, any> ?? undefined,
      lastDateRange:    r.lastDateRange      ?? undefined,
      updatedAt:        r.updatedAt,
    };
  } catch {
    return null;
  }
}

async function saveBrain(accountId: string, data: BrainData): Promise<void> {
  try {
    await db.insert(accountBrains).values({
      accountId,
      auditSummary:     data.auditSummary,
      kpiSnapshot:      data.kpiSnapshot,
      winningCampaigns: data.winningCampaigns,
      losingCampaigns:  data.losingCampaigns,
      audienceInsights: data.audienceInsights,
      creativeInsights: data.creativeInsights,
      scalingInsights:  data.scalingInsights,
      recommendations:  data.recommendations,
      fatigueInfo:      data.fatigueInfo,
      lastDateRange:    data.lastDateRange,
      updatedAt:        new Date(),
    }).onConflictDoUpdate({
      target: accountBrains.accountId,
      set: {
        auditSummary:     data.auditSummary,
        kpiSnapshot:      data.kpiSnapshot,
        winningCampaigns: data.winningCampaigns,
        losingCampaigns:  data.losingCampaigns,
        audienceInsights: data.audienceInsights,
        creativeInsights: data.creativeInsights,
        scalingInsights:  data.scalingInsights,
        recommendations:  data.recommendations,
        fatigueInfo:      data.fatigueInfo,
        lastDateRange:    data.lastDateRange,
        updatedAt:        new Date(),
      },
    });
  } catch { /* brain save failure is non-fatal */ }
}

async function clearBrain(accountId: string): Promise<void> {
  try {
    await db.delete(accountBrains).where(eq(accountBrains.accountId, accountId));
  } catch { }
}

function formatBrainContext(brain: BrainRow): string {
  const ageMs  = Date.now() - brain.updatedAt.getTime();
  const ageMin = Math.round(ageMs / 60_000);
  const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;

  const lines: string[] = [`ACCOUNT BRAIN — last synced: ${ageStr}`];

  if (brain.kpiSnapshot) {
    const k = brain.kpiSnapshot as Record<string, any>;
    const parts = [
      k.spend       ? `Spend: ${k.spend}`       : null,
      k.roas        ? `ROAS: ${k.roas}x`        : null,
      k.ctr         ? `CTR: ${k.ctr}%`          : null,
      k.cpm         ? `CPM: ${k.cpm}`           : null,
      k.purchases   ? `Purchases: ${k.purchases}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`KPIs: ${parts.join(' | ')}`);
  }

  if (brain.auditSummary) lines.push(`Summary: ${brain.auditSummary}`);

  if (Array.isArray(brain.winningCampaigns) && brain.winningCampaigns.length > 0) {
    const winners = brain.winningCampaigns.slice(0, 5)
      .map((c: any) => `${c.name}(ROAS:${c.roas}x)`)
      .join(', ');
    lines.push(`Winners: ${winners}`);
  }

  if (Array.isArray(brain.losingCampaigns) && brain.losingCampaigns.length > 0) {
    const losers = brain.losingCampaigns.slice(0, 3)
      .map((c: any) => `${c.name}(${c.issue ?? 'low ROAS'})`)
      .join(', ');
    lines.push(`Underperformers: ${losers}`);
  }

  if (brain.audienceInsights) {
    const a = brain.audienceInsights as Record<string, any>;
    const parts = [
      a.bestAudience ? `Audience: ${a.bestAudience}` : null,
      a.bestCountry  ? `Country: ${a.bestCountry}`   : null,
      a.bestDevice   ? `Device: ${a.bestDevice}`     : null,
      a.bestAge      ? `Age: ${a.bestAge}`            : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Top Segments: ${parts.join(' | ')}`);
  }

  if (brain.creativeInsights) {
    const c = brain.creativeInsights as Record<string, any>;
    if (c.winningCreativeType) lines.push(`Best Creative: ${c.winningCreativeType}`);
    if (c.topHook) lines.push(`Top Hook: ${c.topHook}`);
  }

  if (brain.fatigueInfo) {
    const f = brain.fatigueInfo as Record<string, any>;
    if (f.fatiguedAdsets)    lines.push(`Fatigued Ad Sets: ${f.fatiguedAdsets} (freq > threshold)`);
    if (f.avgFrequency)      lines.push(`Avg Frequency: ${f.avgFrequency}`);
  }

  if (Array.isArray(brain.recommendations) && brain.recommendations.length > 0) {
    const recs = brain.recommendations.slice(0, 3)
      .map((r: any, i: number) => `${i + 1}. ${r.action ?? r}`)
      .join(' | ');
    lines.push(`Priority Actions: ${recs}`);
  }

  if (brain.lastDateRange) lines.push(`Analysis period: ${brain.lastDateRange}`);

  return lines.join('\n');
}

// ── Provider chain ────────────────────────────────────────────────────────────
// Multi-provider fallback: claude → gemini → groq → mistral → cloudflare → deepseek → openrouter_free
// See providers.ts for full implementation.


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

  // ── ACCOUNT BRAIN ────────────────────────────────────────────────────────────

  {
    name: "save_account_brain",
    description:
      "Save compressed account intelligence to persistent memory. Call this after completing ANY significant data fetch, audit, or analysis. This enables memory-first execution on future requests — the AI will use this stored intelligence instead of re-fetching everything. Always call this after: full audits, campaign analysis, breakdown analysis, or any session where you've learned about the account's performance patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        audit_summary: {
          type: "string",
          description: "1–2 sentence account summary: total spend, ROAS, main issues, overall health",
        },
        kpi_snapshot: {
          type: "object",
          description: "Key metrics object: { spend, roas, ctr, cpm, cpc, purchases, reach, frequency, active_campaigns, paused_campaigns, total_campaigns, top_campaign_name, top_campaign_daily_budget, top_campaign_roas, date_range }",
        },
        winning_campaigns: {
          type: "array",
          items: { type: "object" },
          description: "Top performing campaigns: [{ id, name, status, daily_budget, lifetime_budget, roas, spend, purchases, ctr, cpm }] — ALWAYS include daily_budget and lifetime_budget from campaign data",
        },
        losing_campaigns: {
          type: "array",
          items: { type: "object" },
          description: "Underperforming campaigns: [{ id, name, roas, spend, issue }]",
        },
        audience_insights: {
          type: "object",
          description: "Best segments: { bestAudience, bestCountry, bestDevice, bestAge, bestGender, worstCountry }",
        },
        creative_insights: {
          type: "object",
          description: "Creative learnings: { winningCreativeType, topHook, avgCTR, fatigueSignals, bestFormat }",
        },
        scaling_insights: {
          type: "object",
          description: "Scaling patterns: { maxDailyBudget, bestScalingStructure, roasAtScale, recommendedBidStrategy }",
        },
        recommendations: {
          type: "array",
          items: { type: "object" },
          description: "Priority action list: [{ priority: 1|2|3, action: string, expectedImpact: string }]",
        },
        fatigue_info: {
          type: "object",
          description: "Fatigue data: { fatiguedAdsets: number, avgFrequency, fatiguedCampaigns: number, fatigueThreshold }",
        },
        last_date_range: {
          type: "string",
          description: "Date range this analysis covers (e.g. '2025-05-01 to 2025-05-14')",
        },
      },
      required: ["audit_summary"],
    },
  },

  // ── CAMPAIGN TEMPLATE EXECUTOR ───────────────────────────────────────────────

  {
    name: "execute_campaign_template",
    description:
      "Execute a pre-built campaign template. The backend constructs all Meta API payloads deterministically — the AI only provides strategic decisions. Use this instead of manually calling create_campaign + create_adset. Templates: catalog_sales, broad_scaling, retargeting, lead_generation, whatsapp_campaign, advantage_plus, abo_testing, cbo_scaling, creative_testing, evergreen_scaling.",
    input_schema: {
      type: "object" as const,
      properties: {
        template: {
          type: "string",
          enum: ["catalog_sales", "broad_scaling", "retargeting", "lead_generation", "whatsapp_campaign", "advantage_plus", "abo_testing", "cbo_scaling", "creative_testing", "evergreen_scaling"],
          description: "Template to execute",
        },
        campaign_name: {
          type: "string",
          description: "Base name for the campaign (date suffix added automatically)",
        },
        budget_daily: {
          type: "number",
          description: "Total daily budget in account currency (e.g. 500 = 500 EGP/USD)",
        },
        target_countries: {
          type: "array",
          items: { type: "string" },
          description: "ISO country codes (e.g. ['EG', 'SA', 'AE'])",
        },
        optimization_goal: {
          type: "string",
          description: "Override the template's default optimization goal if needed",
        },
        age_min: { type: "number", description: "Minimum age (default: template default)" },
        age_max: { type: "number", description: "Maximum age (default: template default)" },
        audience_override: {
          type: "object",
          description: "Additional targeting fields to merge (interests, behaviors, custom_audiences, etc.)",
        },
        status: {
          type: "string",
          enum: ["PAUSED", "ACTIVE"],
          description: "Initial campaign status (default: PAUSED for safety)",
        },
      },
      required: ["template", "campaign_name", "budget_daily"],
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
  "save_account_brain",
  "execute_campaign_template",
]);

const READ_TOOL_NAMES = new Set([
  "get_account_overview", "get_breakdown", "get_daily_insights", "get_account_info",
  "get_campaigns", "get_adsets", "get_ads", "get_adcreatives", "get_customaudiences",
  "get_adimages", "get_advideos", "get_adspixels", "get_pixel_stats",
  "get_adrules", "get_customconversions", "get_productcatalogs", "get_catalog_products",
]);

// ── Task mode detection ────────────────────────────────────────────────────────

type TaskMode = "analyze" | "execute" | "plan" | "chat";

function detectTaskMode(messages: { role: string; content: string }[]): TaskMode {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const t = last.toLowerCase();

  // Brain update — always execute mode (check first so it wins over analyze)
  if (
    /(حدث عقلك|حدث العقل|احفظ|حفظ البيانات)/.test(t) ||
    /\b(save brain|update brain)\b/.test(t)
  ) return "execute";

  // Execute — Arabic (no \b) + English (\b only for Latin words)
  if (
    /\b(create|build|launch|make|set up|setup|execute|new campaign|duplicate|scale up|pause all|enable all|deploy)\b/.test(t) ||
    /(نفذ|اعمل|انشئ|فعل|ابدا|ابدأ|عدل|غير|زود|قلل|نسخ|اعمله|اطلقه|وقف الحمله|وقف الحملة|شغل الحمله|شغل الحملة|ارفع الميزانيه|خفض الميزانيه|حملة كاتلوج|حمله كاتلوج|حملة جديده|حمله جديده)/.test(t)
  ) return "execute";

  // Analyze — Arabic (no \b) + English (\b only)
  if (
    /\b(audit|analyze|analyse|check|review|report|show|tell|what is|what's|how is|how are|performance|stats|breakdown|trend|compare|explain|why|roas|ctr|cpm|spend|budget|daily|which campaign)\b/.test(t) ||
    /(صرفت|جابت|شوفلي|كام|اليوم|انهردا|الحمله|الحملة|بيانات|أداء|ادا|نتايج|نتائج|تقرير|إيه|ايه|عامله|عامل|شغاله|شغال|كيف|وقف|اتوقف|فين|مين|امتى|الميزانيه|الميزانية|البادجت|يومي|شغل)/.test(t)
  ) return "analyze";

  // Plan
  if (
    /\b(plan|strategy|recommend|suggest|structure|approach|best way|how should|what should|advise|idea|next step|blueprint|buyer persona|segments)\b/.test(t) ||
    /(خطه|خطة|استراتيجيه|استراتيجية|نصيحه|نصيحة|ايه الافضل|ايه احسن|اقترح|افضل طريقه|باير بيرسونا|سيجمنتات)/.test(t)
  ) return "plan";

  return "chat";
}

const TOOL_GROUPS: Record<TaskMode, string[]> = {
  analyze: [
    "get_account_overview", "get_breakdown", "get_daily_insights",
    "get_account_info", "get_campaigns", "get_adsets", "get_ads",
    "get_adcreatives", "save_account_brain",
  ],
  execute: [
    "create_campaign", "pause_campaign", "enable_campaign", "set_campaign_budget",
    "duplicate_campaign", "create_adset", "pause_adset", "enable_adset",
    "set_adset_budget", "create_ad", "pause_ad", "enable_ad",
    "execute_campaign_template", "save_account_brain",
    "get_campaigns", "get_adsets",
  ],
  plan: [
    "get_account_overview", "get_campaigns", "get_adsets",
    "get_daily_insights", "save_account_brain",
  ],
  chat: [],
};

function getToolsForMode(mode: TaskMode, allOAITools: any[]): any[] {
  const names = TOOL_GROUPS[mode];
  if (names.length === 0) return [];
  return allOAITools.filter((t: any) => names.includes(t.function?.name));
}

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
    save_account_brain:         () => "Saving account intelligence to memory…",
    execute_campaign_template:  () => `Executing ${String(input.template ?? "").replace(/_/g, " ")} template…`,
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
    save_account_brain:         () => "Account intelligence saved to memory",
    execute_campaign_template:  () => {
      const r = result.data as any;
      if (r?.campaign_id) return `Campaign created (ID: ${r.campaign_id}) — ${r.adsets_created ?? 0} ad set(s) created`;
      return "Campaign template executed";
    },
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

      case "save_account_brain": {
        if (!accountId) return { success: false, error: "No account ID — cannot save brain" };
        await saveBrain(accountId, {
          auditSummary:     input.audit_summary,
          kpiSnapshot:      input.kpi_snapshot,
          winningCampaigns: input.winning_campaigns,
          losingCampaigns:  input.losing_campaigns,
          audienceInsights: input.audience_insights,
          creativeInsights: input.creative_insights,
          scalingInsights:  input.scaling_insights,
          recommendations:  input.recommendations,
          fatigueInfo:      input.fatigue_info,
          lastDateRange:    input.last_date_range,
        });
        return {
          success: true,
          data: { message: "Account intelligence saved. I now remember this account and can answer follow-up questions without re-fetching data." },
        };
      }

      // ── CAMPAIGN TEMPLATE EXECUTOR ─────────────────────────────────────────

      case "execute_campaign_template": {
        const tmpl = getTemplate(input.template);
        if (!tmpl) {
          return { success: false, error: `Unknown template: ${input.template}. Available: ${listTemplates().map(t => t.id).join(", ")}` };
        }
        if (!accountId) return { success: false, error: "No account ID — cannot create campaigns" };

        const dailyBudgetCents = String(Math.round(Number(input.budget_daily) * 100));
        const countries: string[] = Array.isArray(input.target_countries) && input.target_countries.length > 0
          ? input.target_countries
          : ["US"];
        const campaignName = input.campaign_name ?? buildNamingConvention(tmpl, tmpl.name);
        const status = input.status ?? "PAUSED";

        // Step 1: Create campaign
        const campaignBody: Record<string, any> = {
          name: campaignName,
          objective: tmpl.objective,
          status,
          special_ad_categories: tmpl.special_ad_categories,
        };
        // CBO templates set budget at campaign level
        if (tmpl.id === "cbo_scaling") {
          campaignBody.daily_budget = dailyBudgetCents;
        }

        const campaignData = await metaPost(`/act_${accountId}/campaigns`, token, campaignBody);
        if (!campaignData || campaignData.error) {
          return { success: false, error: `Campaign creation failed: ${campaignData?.error?.message ?? JSON.stringify(campaignData?.error ?? campaignData)}` };
        }
        const campaignId: string = campaignData.id;

        // Step 2: Create ad sets
        const adsetIds: string[] = [];
        const numAdsets = tmpl.num_adsets;
        const totalBudget = Number(input.budget_daily);
        const ratios = tmpl.budget_split_ratios;

        for (let i = 0; i < numAdsets; i++) {
          const adsetName = `${campaignName} | ${tmpl.adset_name_suffixes[i] ?? `AdSet_${i + 1}`}`;
          const adsetBudget = tmpl.id === "cbo_scaling"
            ? undefined
            : Math.round(totalBudget * (ratios[i] ?? 1 / numAdsets) * 100);

          const targeting: Record<string, any> = {
            geo_locations: { countries },
            age_min: input.age_min ?? tmpl.targeting_defaults.age_min,
            age_max: input.age_max ?? tmpl.targeting_defaults.age_max,
          };
          if (tmpl.targeting_defaults.genders) targeting.genders = tmpl.targeting_defaults.genders;
          if (input.audience_override) Object.assign(targeting, input.audience_override);

          const adsetBody: Record<string, any> = {
            campaign_id: campaignId,
            name: adsetName,
            status,
            billing_event: tmpl.billing_event,
            optimization_goal: input.optimization_goal ?? tmpl.optimization_goal,
            targeting: JSON.stringify(targeting),
          };
          if (adsetBudget) adsetBody.daily_budget = String(adsetBudget);

          // Manual placements
          if (tmpl.placement_type === "manual" && tmpl.manual_placements) {
            adsetBody.targeting = JSON.stringify({
              ...targeting,
              publisher_platforms: tmpl.manual_placements.publisher_platforms,
              facebook_positions:  tmpl.manual_placements.facebook_positions,
              instagram_positions: tmpl.manual_placements.instagram_positions,
            });
          }

          const adsetData = await metaPost(`/act_${accountId}/adsets`, token, adsetBody);
          if (!adsetData || adsetData.error) {
            return {
              success: false,
              error: `Ad set creation failed (${adsetName}): ${adsetData?.error?.message ?? JSON.stringify(adsetData?.error ?? adsetData)}`,
              data: { campaign_id: campaignId, adsets_created: adsetIds.length },
            };
          }
          adsetIds.push(adsetData.id);
        }

        return {
          success: true,
          data: {
            campaign_id: campaignId,
            campaign_name: campaignName,
            adset_ids: adsetIds,
            adsets_created: adsetIds.length,
            template: tmpl.id,
            status,
            budget_daily: input.budget_daily,
            countries,
            scaling_notes: tmpl.scaling_notes,
            message: `Template "${tmpl.name}" executed: campaign ${campaignId} + ${adsetIds.length} ad set(s) created as ${status}.`,
          },
        };
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

// ── Brain REST endpoints ───────────────────────────────────────────────────────

router.get("/ai/brain/:accountId", async (req, res): Promise<void> => {
  const accountId = String(req.params.accountId).replace(/^act_/, "");
  const brain = await loadBrain(accountId);
  res.json({ brain: brain ?? null });
});

router.delete("/ai/brain/:accountId", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  if (!rawToken) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = String(req.params.accountId).replace(/^act_/, "");
  await clearBrain(accountId);
  res.json({ success: true });
});

// ── Models endpoint ───────────────────────────────────────────────────────────

router.get("/ai/models", (_req, res): void => {
  res.json({
    provider: "multi",
    models: [
      {
        id:          "auto",
        name:        "Auto (Multi-Provider)",
        description: "Claude → Gemini → Groq → Mistral → Cloudflare → DeepSeek → OpenRouter",
      },
    ],
  });
});

// ── Provider status endpoint ──────────────────────────────────────────────────

router.get("/provider-status", (_req, res): void => {
  res.json(getProviderStatus());
});

// ── Main route ─────────────────────────────────────────────────────────────────

router.post("/ai/chat", async (req, res): Promise<void> => {
  const rawToken = req.headers["x-meta-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { messages, context, selectedProvider } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    model?: string;
    selectedProvider?: string;
    context?: {
      accountId?: string;
      accountName?: string;
      currency?: string;
      since?: string;
      until?: string;
    };
  };

  const VALID_PROVIDERS: ProviderName[] = ["groq", "mistral", "cloudflare", "deepseek", "openrouter_free"];
  const forcedProvider: ProviderName | null =
    selectedProvider && selectedProvider !== "auto" && VALID_PROVIDERS.includes(selectedProvider as ProviderName)
      ? (selectedProvider as ProviderName)
      : null;

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

  // Detect task mode first (used in system prompt construction)
  const taskMode = detectTaskMode(messages);
  console.log(`[AI] taskMode="${taskMode}" | last_user_msg="${messages.filter(m => m.role === "user").at(-1)?.content?.slice(0, 80) ?? ""}"`);


  // Load brain before building system prompt
  const brain = accountId ? await loadBrain(accountId) : null;
  const brainAgeMs  = brain ? Date.now() - brain.updatedAt.getTime() : null;
  const brainFresh  = brainAgeMs !== null && brainAgeMs < 2 * 60 * 60 * 1000; // fresh < 2h

  const brainSection = brain
    ? formatBrainContext(brain)
    : "No brain data — run a full account analysis to build memory.";

  const modeInstruction = taskMode === "execute"
    ? `MODE: EXECUTE — CRITICAL RULES:
- NEVER write JSON in your response text
- NEVER simulate or describe tool calls
- ALWAYS call the actual tool directly
- If user says نفذ after a plan: call execute_campaign_template immediately
- If campaign creation fails: report the EXACT error from Meta API
- Never say تم بنجاح unless you received a real campaign_id from Meta API
- A real success always includes a numeric campaign_id like 12345678901234
- Use execute_campaign_template for new campaigns. For edits, fetch the campaign/adset ID first, then act.`
    : taskMode === "analyze"
    ? "MODE: ANALYZE — Fetch data, identify patterns, save to brain. Be specific with numbers. No generic advice."
    : taskMode === "plan"
    ? "MODE: PLAN — Use brain data first. Only fetch if brain is absent. Return a structured plan with priorities."
    : "MODE: CHAT — Answer from brain memory only. No tool calls needed.";

  const systemPrompt = `You are JOEX — an elite Meta Ads operator and strategic media buyer with full live access to the Meta Marketing API.

ACCOUNT: ${accountName} | act_${accountId} | ${currency} | ${since} → ${until}

ACCOUNT BRAIN:
${brainSection}

IDENTITY & MINDSET
You think like a senior performance marketer managing a $50K/month account.
You are proactive, direct, and numbers-driven.
You speak in results, not possibilities.
You never say "I can help you" — you just do it.
You never say "Let me fetch" — you fetch and report.
You communicate in the same language the user writes in.
Arabic → reply in Arabic. English → reply in English.

CRITICAL RULE — HUMAN APPROVAL REQUIRED
You NEVER execute any of the following without explicit human approval:
- Pause, enable, or delete any campaign / ad set / ad
- Change any budget (increase or decrease)
- Create any campaign, ad set, or ad
- Modify any targeting, creative, or bid strategy
- Change any spend cap or schedule

APPROVAL PROTOCOL:
1. Analyze the situation using real data
2. State exactly what you recommend and why
3. Show the expected impact with numbers
4. Ask: "هل تريد مني تنفيذ هذا؟" or "Should I execute this?"
5. Wait for explicit confirmation (yes / اتفضل / نفذ / confirm)
6. Only then execute — report exactly what was done
If unclear → ask. Never assume.

HOW YOU THINK (always in this order):
1. FETCH — Pull real live data first. Never answer from memory alone.
2. DIAGNOSE — What is actually happening?
3. IDENTIFY — Root cause, not symptom.
4. RECOMMEND — Single best action right now.
5. QUANTIFY — Expected impact in numbers.
6. CONFIRM — Get approval before execution.
7. EXECUTE — Do exactly what was approved, nothing more.
8. REPORT — Confirm what was done.

PROACTIVE FLAGS (check after every analysis):
- ROAS dropped more than 20% vs last week → flag immediately
- Frequency above 3.5x on any ad set → flag immediately
- CPP increased more than 25% vs last week → flag immediately
- High-performing campaign that is PAUSED → flag immediately
- Ad set stuck in Learning Phase over 7 days → flag immediately
- Budget running out before end of day → flag immediately

After every analysis, end with:
🚨 URGENT: anything requiring action today
⚡ OPPORTUNITY: any quick win available right now
📊 WATCH: metrics trending in the wrong direction

COMMUNICATION STYLE:
- Lead with the most important finding
- Use tables for any comparison of 3+ items
- Use numbers always — no vague statements
- Max 3 recommendations at a time, prioritized
- Be direct: "هذا الـ Ad Set يخسر مالك" not "قد يكون هناك فرصة"

EXECUTION RULES:
- Always reference real campaign names, IDs, and numbers
- Never create targeting specs without showing them first
- After any execution → call save_account_brain
- If a tool call fails → report the exact error
- Never hallucinate data — if you don't have it, fetch it`;

  // Select relevant tool subset for detected mode
  const allOAITools = accountId ? toOAITools(TOOLS) : [];
  const selectedTools = getToolsForMode(taskMode, allOAITools);
  console.log(`[AI] selectedTools=[${selectedTools.map((t: any) => t.function?.name).join(", ")}]`);


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
    const currentMessages: AIMessage[] = messages.map((m: { role: string; content: string }) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    }));

    let lastProvider: ProviderName = "openrouter_free";
    let lastModel = "auto";
    const tokensTotal = { prompt: 0, completion: 0, total: 0 };
    const startTime = Date.now();

    emit({ type: "model", model: forcedProvider ?? "auto", provider: forcedProvider ?? "auto", mode: taskMode });

    // Agentic loop — max 5 iterations
    for (let iter = 0; iter < 5; iter++) {
      const aiResult = forcedProvider
        ? await callProvider(forcedProvider, currentMessages, selectedTools, systemPrompt)
        : await callWithFallback(currentMessages, selectedTools, systemPrompt);

      lastProvider = aiResult.provider;
      lastModel    = aiResult.model;
      tokensTotal.total += aiResult.tokens;

      emit({ type: "model", model: aiResult.model, provider: aiResult.provider, mode: taskMode });

      // Stream text content in small chunks
      if (aiResult.content) {
        const chunkSize = 4;
        for (let i = 0; i < aiResult.content.length; i += chunkSize) {
          emit({ content: aiResult.content.slice(i, i + chunkSize) });
        }
      }

      // No tool calls or explicit stop → done
      if (!aiResult.toolCalls?.length || aiResult.finishReason === "stop") {
        break;
      }

      // Add assistant turn with tool_calls to history
      currentMessages.push({
        role:       "assistant",
        content:    aiResult.content || null,
        tool_calls: aiResult.toolCalls,
      });

      // Execute each tool call sequentially
      for (const toolCall of aiResult.toolCalls) {
        const toolName = toolCall.function.name;
        let toolInput: Record<string, any> = {};
        try { toolInput = JSON.parse(toolCall.function.arguments || "{}") ?? {}; } catch {}

        const isAction = ACTION_TOOLS.has(toolName);
        emit({ type: "tool_call", tool: toolName, label: toolCallLabel(toolName, toolInput), isAction, input: toolInput });

        const result = await executeTool(toolName, toolInput, token, accountId, since, until);
        emit({ type: "tool_done", tool: toolName, label: toolDoneLabel(toolName, toolInput, result), isAction, success: result.success, error: result.error, input: toolInput });

        currentMessages.push({
          role:         "tool",
          tool_call_id: toolCall.id,
          content: result.success
            ? JSON.stringify(trimData(result.data))
            : JSON.stringify({ error: result.error }),
        });
      }
    }

    const duration = Date.now() - startTime;
    emit({ done: true, model: lastModel, provider: lastProvider, tokens: tokensTotal, duration });
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    emit({ error: msg });
    res.end();
  }
});

export default router;
