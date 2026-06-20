export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, any>; required?: string[] };
}

export const TOOLS: ToolDef[] = [

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
      "Get account financial info: balance, spend cap, amount spent, account status, minimum daily budget, currency.",
    input_schema: { type: "object" as const, properties: {} },
  },

  // ── CAMPAIGNS ────────────────────────────────────────────────────────────────

  {
    name: "get_campaigns",
    description:
      "Get ALL campaigns with their status, objectives, budgets, and performance metrics (ROAS, spend, CTR, CPM). Essential for any audit or campaign-level analysis.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_campaign",
    description:
      "Create a new campaign. Use execute_campaign_template for standard campaign types — only use this for custom objectives.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:                  { type: "string", description: "Campaign name" },
        objective:             { type: "string", enum: ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"], description: "Campaign objective" },
        status:                { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Initial status (default: PAUSED)" },
        daily_budget:          { type: "number", description: "Daily budget in account currency (e.g. 500 = 500 EGP/USD)" },
        lifetime_budget:       { type: "number", description: "Lifetime budget instead of daily_budget" },
        special_ad_categories: { type: "array", items: { type: "string" }, description: "Empty [] for most campaigns" },
      },
      required: ["name", "objective"],
    },
  },
  {
    name: "pause_campaign",
    description: "PAUSE a specific campaign by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id:   { type: "string" },
        campaign_name: { type: "string" },
        reason:        { type: "string" },
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
        campaign_id:   { type: "string" },
        campaign_name: { type: "string" },
        reason:        { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "set_campaign_budget",
    description: "Change the daily budget of a campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id:   { type: "string" },
        campaign_name: { type: "string" },
        daily_budget:  { type: "number", description: "New daily budget in account currency" },
        reason:        { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "daily_budget", "reason"],
    },
  },
  {
    name: "delete_campaign",
    description: "PERMANENTLY DELETE a campaign. Irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id:   { type: "string" },
        campaign_name: { type: "string" },
        reason:        { type: "string" },
      },
      required: ["campaign_id", "campaign_name", "reason"],
    },
  },
  {
    name: "duplicate_campaign",
    description: "Duplicate a campaign (creates a paused copy by default).",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id:     { type: "string" },
        campaign_name:   { type: "string" },
        copies:          { type: "number", description: "Number of copies (default: 1)" },
        status_override: { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Status of the copy (default: PAUSED)" },
      },
      required: ["campaign_id", "campaign_name"],
    },
  },
  {
    name: "set_spend_cap",
    description: "Set or remove the account-level spend cap. Pass 0 to remove the cap entirely.",
    input_schema: {
      type: "object" as const,
      properties: {
        spend_cap: { type: "number", description: "Maximum account spend in account currency. 0 = remove cap." },
        reason:    { type: "string" },
      },
      required: ["spend_cap", "reason"],
    },
  },

  // ── AD SETS ──────────────────────────────────────────────────────────────────

  {
    name: "get_adsets",
    description:
      "Get ad sets with performance metrics. Filter by campaign_id for campaign-specific analysis, or omit to get all ad sets.",
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
      "Create a new ad set inside a campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaign_id:       { type: "string" },
        name:              { type: "string" },
        status:            { type: "string", enum: ["ACTIVE", "PAUSED"] },
        billing_event:     { type: "string", enum: ["IMPRESSIONS", "LINK_CLICKS", "APP_INSTALLS", "NONE"], description: "How you pay" },
        optimization_goal: { type: "string", description: "OFFSITE_CONVERSIONS, REACH, LINK_CLICKS, LEAD_GENERATION, etc." },
        daily_budget:      { type: "number", description: "Daily budget in account currency" },
        lifetime_budget:   { type: "number", description: "Lifetime budget instead of daily" },
        targeting:         { type: "object", description: "Targeting spec: { geo_locations: { countries: ['EG'] }, age_min, age_max, genders, interests, behaviors }" },
        bid_strategy:      { type: "string", enum: ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "MINIMUM_ROAS"], description: "Bid strategy" },
        promoted_object:   { type: "object", description: "For OUTCOME_SALES/LEADS: { pixel_id, custom_event_type: 'PURCHASE'|'LEAD' }" },
        start_time:        { type: "string", description: "ISO 8601 start time (optional)" },
        end_time:          { type: "string", description: "ISO 8601 end time (optional)" },
      },
      required: ["campaign_id", "name", "billing_event", "optimization_goal"],
    },
  },
  {
    name: "pause_adset",
    description: "PAUSE a specific ad set.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id:   { type: "string" },
        adset_name: { type: "string" },
        reason:     { type: "string" },
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
        adset_id:   { type: "string" },
        adset_name: { type: "string" },
        reason:     { type: "string" },
      },
      required: ["adset_id", "adset_name", "reason"],
    },
  },
  {
    name: "set_adset_budget",
    description: "Change the daily budget of a specific ad set.",
    input_schema: {
      type: "object" as const,
      properties: {
        adset_id:     { type: "string" },
        adset_name:   { type: "string" },
        daily_budget: { type: "number" },
        reason:       { type: "string" },
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
        adset_id:   { type: "string" },
        adset_name: { type: "string" },
        reason:     { type: "string" },
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
        adset_id:    { type: "string", description: "Parent ad set ID" },
        name:        { type: "string", description: "Ad name" },
        creative_id: { type: "string", description: "Existing ad creative ID" },
        status:      { type: "string", enum: ["ACTIVE", "PAUSED"], description: "Initial status" },
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
        ad_id:   { type: "string" },
        ad_name: { type: "string" },
        reason:  { type: "string" },
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
        ad_id:   { type: "string" },
        ad_name: { type: "string" },
        reason:  { type: "string" },
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
        ad_id:   { type: "string" },
        ad_name: { type: "string" },
        reason:  { type: "string" },
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
        creative_id:   { type: "string" },
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
      "Create a Lookalike Audience from an existing source audience. Specify country and lookalike ratio (1%–10% — 1% is most similar).",
    input_schema: {
      type: "object" as const,
      properties: {
        name:               { type: "string", description: "Name for the lookalike audience" },
        origin_audience_id: { type: "string", description: "Source custom audience ID" },
        country:            { type: "string", description: "Two-letter country code (e.g. US, GB, AE)" },
        ratio:              { type: "number", description: "Lookalike ratio 0.01–0.10 (1%–10%)" },
        description:        { type: "string", description: "Optional description" },
      },
      required: ["name", "origin_audience_id", "country", "ratio"],
    },
  },
  {
    name: "create_customaudience",
    description: "Create a new custom audience (website visitors, customer list, engagement, or lookalike source).",
    input_schema: {
      type: "object" as const,
      properties: {
        name:                 { type: "string", description: "Audience name" },
        subtype:              { type: "string", enum: ["CUSTOM", "WEBSITE", "APP", "ENGAGEMENT", "LOOKALIKE", "PAGE_VISITS"], description: "Audience type" },
        description:          { type: "string", description: "Description of the audience" },
        customer_file_source: { type: "string", enum: ["USER_PROVIDED_ONLY", "PARTNER_PROVIDED_ONLY", "BOTH_USER_AND_PARTNER_PROVIDED"], description: "Required for CUSTOM subtype" },
        retention_days:       { type: "number", description: "Retention window in days for WEBSITE type (1–180)" },
        rule:                 { type: "string", description: "JSON-encoded rule for WEBSITE/ENGAGEMENT audiences" },
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
        audience_id:   { type: "string" },
        audience_name: { type: "string" },
      },
      required: ["audience_id", "audience_name"],
    },
  },

  // ── AD IMAGES ────────────────────────────────────────────────────────────────

  {
    name: "get_adimages",
    description: "Get all ad images in the account. Returns image hash, name, width, height, URL, status.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "upload_adimage_by_url",
    description: "Upload an ad image from a public URL. Returns the image hash needed for creative creation.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Image name/label" },
        url:  { type: "string", description: "Public HTTPS URL of the image to upload" },
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
    description: "Get all ad videos in the account. Returns video ID, title, length, thumbnails, status.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "delete_advideo",
    description: "DELETE an ad video from the account.",
    input_schema: {
      type: "object" as const,
      properties: {
        video_id:    { type: "string" },
        video_title: { type: "string" },
      },
      required: ["video_id", "video_title"],
    },
  },

  // ── PIXELS ───────────────────────────────────────────────────────────────────

  {
    name: "get_adspixels",
    description: "Get all Meta Pixel (Ads Pixel) IDs for the account with creation date and last fired time.",
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
    description: "Get event stats (pageview, purchase, lead, add_to_cart, etc.) for a specific pixel.",
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
    description: "Get all automated ad rules for the account: rule name, status, conditions, actions, schedule.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_adrule",
    description: "Create an automated ad rule that fires actions when conditions are met.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:            { type: "string", description: "Rule name" },
        evaluation_spec: { type: "object", description: "{ evaluation_type: 'SCHEDULE'|'TRIGGER', filters: [{field, value, operator}], schedule_spec: {schedule_type: 'SEMI_HOURLY'|'HOURLY'|'DAILY'|'WEEKLY'} }" },
        execution_spec:  { type: "object", description: "{ execution_type: 'PAUSE'|'UNPAUSE'|'CHANGE_BUDGET'|'SEND_NOTIFICATION', execution_options: {...} }" },
        status:          { type: "string", enum: ["ENABLED", "DISABLED"], description: "Rule status" },
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
        rule_id:   { type: "string" },
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
        rule_id:   { type: "string" },
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
        rule_id:   { type: "string" },
        rule_name: { type: "string" },
      },
      required: ["rule_id", "rule_name"],
    },
  },

  // ── CUSTOM CONVERSIONS ───────────────────────────────────────────────────────

  {
    name: "get_customconversions",
    description: "Get all custom conversions for the account.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_customconversion",
    description: "Create a new custom conversion based on URL rules or pixel events.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:              { type: "string", description: "Custom conversion name" },
        pixel_id:          { type: "string", description: "Associated pixel ID" },
        custom_event_type: { type: "string", enum: ["ADD_PAYMENT_INFO", "ADD_TO_CART", "ADD_TO_WISHLIST", "COMPLETE_REGISTRATION", "CONTENT_VIEW", "INITIATED_CHECKOUT", "LEAD", "PURCHASE", "SEARCH", "OTHER"], description: "Event type to track" },
        rule:              { type: "string", description: "JSON-encoded URL rule" },
        description:       { type: "string", description: "Optional description" },
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
        conversion_id:   { type: "string" },
        conversion_name: { type: "string" },
      },
      required: ["conversion_id", "conversion_name"],
    },
  },

  // ── PRODUCT CATALOGS ─────────────────────────────────────────────────────────

  {
    name: "get_productcatalogs",
    description: "Get all product catalogs linked to the business.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_catalog_products",
    description: "Get products inside a specific catalog.",
    input_schema: {
      type: "object" as const,
      properties: {
        catalog_id: { type: "string", description: "Catalog ID" },
        filter:     { type: "string", description: "Optional: filter by availability" },
        limit:      { type: "number", description: "Max results (default 50, max 200)" },
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
        catalog_id:   { type: "string" },
        product_id:   { type: "string" },
        product_name: { type: "string" },
      },
      required: ["catalog_id", "product_id", "product_name"],
    },
  },

  // ── ACCOUNT BRAIN ────────────────────────────────────────────────────────────

  {
    name: "save_account_brain",
    description:
      "Save compressed account intelligence to persistent memory. Call this after completing ANY significant data fetch, audit, or analysis. This enables memory-first execution on future requests.",
    input_schema: {
      type: "object" as const,
      properties: {
        audit_summary:     { type: "string", description: "1–2 sentence account summary: total spend, ROAS, main issues, overall health" },
        kpi_snapshot:      { type: "object", description: "Key metrics: { spend, roas, ctr, cpm, cpc, purchases, reach, frequency, active_campaigns, date_range }" },
        winning_campaigns: { type: "array", items: { type: "object" }, description: "Top performers: [{ id, name, roas, spend, daily_budget, lifetime_budget }]" },
        losing_campaigns:  { type: "array", items: { type: "object" }, description: "Underperformers: [{ id, name, roas, spend, issue }]" },
        audience_insights: { type: "object", description: "Best segments: { bestAudience, bestCountry, bestDevice, bestAge, bestGender, worstCountry }" },
        creative_insights: { type: "object", description: "Creative learnings: { winningCreativeType, topHook, avgCTR, fatigueSignals, bestFormat }" },
        scaling_insights:  { type: "object", description: "Scaling patterns: { maxDailyBudget, bestScalingStructure, roasAtScale, recommendedBidStrategy }" },
        recommendations:   { type: "array", items: { type: "object" }, description: "Priority actions: [{ priority: 1|2|3, action, expectedImpact }]" },
        fatigue_info:      { type: "object", description: "Fatigue data: { fatiguedAdsets, avgFrequency, fatigueThreshold }" },
        last_date_range:   { type: "string", description: "Date range this analysis covers (e.g. '2025-05-01 to 2025-05-14')" },
      },
      required: ["audit_summary"],
    },
  },

  // ── CAMPAIGN TEMPLATE EXECUTOR ───────────────────────────────────────────────

  {
    name: "execute_campaign_template",
    description:
      "Execute a pre-built campaign template. The backend constructs all Meta API payloads deterministically — the AI only provides strategic decisions. Templates: catalog_sales, broad_scaling, retargeting, lead_generation, whatsapp_campaign, advantage_plus, abo_testing, cbo_scaling, creative_testing, evergreen_scaling.",
    input_schema: {
      type: "object" as const,
      properties: {
        template:          { type: "string", enum: ["catalog_sales", "broad_scaling", "retargeting", "lead_generation", "whatsapp_campaign", "advantage_plus", "abo_testing", "cbo_scaling", "creative_testing", "evergreen_scaling"], description: "Template to execute" },
        campaign_name:     { type: "string", description: "Base name for the campaign" },
        budget_daily:      { type: "number", description: "Total daily budget in account currency" },
        target_countries:  { type: "array", items: { type: "string" }, description: "ISO country codes (e.g. ['EG', 'SA', 'AE'])" },
        optimization_goal: { type: "string", description: "Override the template's default optimization goal if needed" },
        age_min:           { type: "number", description: "Minimum age" },
        age_max:           { type: "number", description: "Maximum age" },
        audience_override: { type: "object", description: "Additional targeting fields to merge" },
        pixel_id:          { type: "string", description: "Pixel ID for OUTCOME_SALES / OUTCOME_LEADS. Auto-fetched if omitted." },
        status:            { type: "string", enum: ["PAUSED", "ACTIVE"], description: "Initial campaign status (default: PAUSED)" },
      },
      required: ["template", "campaign_name", "budget_daily"],
    },
  },
];

export const ACTION_TOOLS = new Set([
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

export const READ_TOOL_NAMES = new Set([
  "get_account_overview", "get_breakdown", "get_daily_insights", "get_account_info",
  "get_campaigns", "get_adsets", "get_ads", "get_adcreatives", "get_customaudiences",
  "get_adimages", "get_advideos", "get_adspixels", "get_pixel_stats",
  "get_adrules", "get_customconversions", "get_productcatalogs", "get_catalog_products",
]);
