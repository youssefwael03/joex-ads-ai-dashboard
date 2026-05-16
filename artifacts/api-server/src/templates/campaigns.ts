export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  objective: string;
  optimization_goal: string;
  billing_event: string;
  bid_strategy: string;
  placement_type: "automatic" | "manual";
  manual_placements?: {
    publisher_platforms: string[];
    facebook_positions?: string[];
    instagram_positions?: string[];
    audience_network_positions?: string[];
  };
  targeting_defaults: {
    age_min: number;
    age_max: number;
    genders?: number[];
  };
  num_adsets: number;
  budget_split_ratios: number[];
  adset_name_suffixes: string[];
  naming_convention: string;
  special_ad_categories: string[];
  requires_pixel?: boolean;
  requires_catalog?: boolean;
  requires_page?: boolean;
  scaling_notes: string;
}

export const CAMPAIGN_TEMPLATES: Record<string, CampaignTemplate> = {

  catalog_sales: {
    id: "catalog_sales",
    name: "Catalog Sales",
    description: "DPA/catalog remarketing and prospecting for e-commerce. Best for retargeting past visitors with dynamic product ads.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["DPA_Broad"],
    naming_convention: "{name} | Catalog | {date}",
    special_ad_categories: [],
    requires_catalog: true,
    scaling_notes: "Scale by increasing budget 20% every 3 days if ROAS > target. Add lookalike adsets when primary saturates.",
  },

  broad_scaling: {
    id: "broad_scaling",
    name: "Broad Scaling",
    description: "Wide-open targeting with Advantage+ audience. Best for accounts with strong pixel data (500+ purchases). Let Meta find buyers at scale.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["Broad_Advantage+"],
    naming_convention: "{name} | Broad | {date}",
    special_ad_categories: [],
    scaling_notes: "Budget scale aggressively once CPA stabilizes. Duplicate winning adsets horizontally.",
  },

  retargeting: {
    id: "retargeting",
    name: "Retargeting",
    description: "Re-engage website visitors, video viewers, and social engagers. Typically 3–7 day and 14–30 day windows.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 2,
    budget_split_ratios: [0.6, 0.4],
    adset_name_suffixes: ["Retarget_7d", "Retarget_30d"],
    naming_convention: "{name} | Retarget | {date}",
    special_ad_categories: [],
    requires_pixel: true,
    scaling_notes: "Monitor frequency — pause/refresh creatives when frequency > 3.5 within 7 days.",
  },

  lead_generation: {
    id: "lead_generation",
    name: "Lead Generation",
    description: "Native Meta lead forms for collecting contact info without a landing page. Ideal for services, finance, real estate.",
    objective: "OUTCOME_LEADS",
    optimization_goal: "LEAD_GENERATION",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 25, age_max: 55 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["LeadForm_Broad"],
    naming_convention: "{name} | Leads | {date}",
    special_ad_categories: [],
    requires_page: true,
    scaling_notes: "Duplicate ad sets with new creatives when CPL rises > 20% from baseline.",
  },

  whatsapp_campaign: {
    id: "whatsapp_campaign",
    name: "WhatsApp Campaign",
    description: "Drive click-to-WhatsApp conversations. Excellent for markets where WhatsApp is the primary communication channel (MENA, LATAM).",
    objective: "OUTCOME_ENGAGEMENT",
    optimization_goal: "CONVERSATIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "manual",
    manual_placements: {
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "story"],
      instagram_positions: ["stream", "story"],
    },
    targeting_defaults: { age_min: 18, age_max: 55 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["WhatsApp_Broad"],
    naming_convention: "{name} | WA | {date}",
    special_ad_categories: [],
    requires_page: true,
    scaling_notes: "Scale based on cost-per-conversation. Add new interest audiences when primary saturates.",
  },

  advantage_plus: {
    id: "advantage_plus",
    name: "Advantage+ Shopping",
    description: "Meta's fully automated shopping campaign. Combines prospecting + retargeting in one. Requires 50+ conversions/week for best results.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["ASC_Main"],
    naming_convention: "{name} | ASC | {date}",
    special_ad_categories: [],
    requires_pixel: true,
    scaling_notes: "Let run 7 days before optimization. Scale budget 15-20% weekly if profitable.",
  },

  abo_testing: {
    id: "abo_testing",
    name: "ABO Creative Testing",
    description: "Ad Set Budget Optimization for controlled A/B creative testing. Each ad set has equal budget for fair comparison.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 3,
    budget_split_ratios: [0.33, 0.33, 0.34],
    adset_name_suffixes: ["Test_A", "Test_B", "Test_C"],
    naming_convention: "{name} | ABO Test | {date}",
    special_ad_categories: [],
    scaling_notes: "Run 7 days minimum. Kill losers at statistical significance. Move budget to winner.",
  },

  cbo_scaling: {
    id: "cbo_scaling",
    name: "CBO Scaling",
    description: "Campaign Budget Optimization across multiple ad sets. Meta automatically allocates budget to best performers.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 3,
    budget_split_ratios: [1, 0, 0],
    adset_name_suffixes: ["CBO_Broad", "CBO_Lookalike", "CBO_Interest"],
    naming_convention: "{name} | CBO | {date}",
    special_ad_categories: [],
    scaling_notes: "Budget set at campaign level. Add spending floor/ceiling per adset to control distribution.",
  },

  creative_testing: {
    id: "creative_testing",
    name: "Creative Testing",
    description: "DCO/split test framework for rapid creative iteration. Tests hooks, formats, and angles systematically.",
    objective: "OUTCOME_SALES",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 1,
    budget_split_ratios: [1],
    adset_name_suffixes: ["Creative_Test"],
    naming_convention: "{name} | Creative Test | {date}",
    special_ad_categories: [],
    scaling_notes: "Optimize for CTR and thumb-stop ratio first. Graduate winners to purchase-optimized campaigns.",
  },

  evergreen_scaling: {
    id: "evergreen_scaling",
    name: "Evergreen Scaling",
    description: "Long-running performance campaign with proven creatives and stable audience. Structured for sustainable scaling without creative fatigue.",
    objective: "OUTCOME_SALES",
    optimization_goal: "PURCHASE",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    placement_type: "automatic",
    targeting_defaults: { age_min: 18, age_max: 65 },
    num_adsets: 2,
    budget_split_ratios: [0.7, 0.3],
    adset_name_suffixes: ["Evergreen_Main", "Evergreen_Test"],
    naming_convention: "{name} | Evergreen | {date}",
    special_ad_categories: [],
    requires_pixel: true,
    scaling_notes: "Main adset gets 70% of budget. Test slot rotates new creatives. Refresh every 3-4 weeks.",
  },
};

export function getTemplate(id: string): CampaignTemplate | null {
  return CAMPAIGN_TEMPLATES[id] ?? null;
}

export function listTemplates(): Array<{ id: string; name: string; description: string }> {
  return Object.values(CAMPAIGN_TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));
}

export function buildNamingConvention(template: CampaignTemplate, campaignName: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return template.naming_convention
    .replace("{name}", campaignName)
    .replace("{date}", date);
}
