import { metaGet, metaPost, metaDelete, buildMetaError, INSIGHT_FIELDS } from "../utils";
import { saveBrain } from "../brain";
import { getTemplate, listTemplates, buildNamingConvention } from "../../templates/campaigns";
import type { ToolResult } from "../labels";

export async function executeTool(
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
          buying_type: "AUCTION",
        };
        if (input.daily_budget)    body.daily_budget    = String(Math.round(Number(input.daily_budget) * 100));
        if (input.lifetime_budget) body.lifetime_budget = String(Math.round(Number(input.lifetime_budget) * 100));
        const data = await metaPost(`/act_${accountId}/campaigns`, token, body);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "pause_campaign": {
        const data = await metaPost(`/${input.campaign_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Paused: ${input.campaign_name}` } };
      }

      case "enable_campaign": {
        const data = await metaPost(`/${input.campaign_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Enabled: ${input.campaign_name}` } };
      }

      case "set_campaign_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${input.campaign_id}`, token, { daily_budget: budgetCents });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Budget set: ${input.daily_budget}` } };
      }

      case "delete_campaign": {
        const data = await metaDelete(`/${input.campaign_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Deleted: ${input.campaign_name}` } };
      }

      case "duplicate_campaign": {
        const body: Record<string, any> = {
          copies: String(input.copies ?? 1),
          status_override: input.status_override ?? "PAUSED",
        };
        const data = await metaPost(`/${input.campaign_id}/copies`, token, body);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "set_spend_cap": {
        const capValue = Number(input.spend_cap) === 0
          ? "0"
          : String(Math.round(Number(input.spend_cap) * 100));
        const data = await metaPost(`/act_${accountId}`, token, { spend_cap: capValue });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (input.bid_strategy)    body.bid_strategy    = input.bid_strategy;
        if (input.promoted_object) body.promoted_object = typeof input.promoted_object === "string" ? input.promoted_object : JSON.stringify(input.promoted_object);
        const data = await metaPost(`/act_${accountId}/adsets`, token, body);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "pause_adset": {
        const data = await metaPost(`/${input.adset_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Paused: ${input.adset_name}` } };
      }

      case "enable_adset": {
        const data = await metaPost(`/${input.adset_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Enabled: ${input.adset_name}` } };
      }

      case "set_adset_budget": {
        const budgetCents = String(Math.round(Number(input.daily_budget) * 100));
        const data = await metaPost(`/${input.adset_id}`, token, { daily_budget: budgetCents });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Budget set: ${input.daily_budget}` } };
      }

      case "delete_adset": {
        const data = await metaDelete(`/${input.adset_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "pause_ad": {
        const data = await metaPost(`/${input.ad_id}`, token, { status: "PAUSED" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Paused: ${input.ad_name}` } };
      }

      case "enable_ad": {
        const data = await metaPost(`/${input.ad_id}`, token, { status: "ACTIVE" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Enabled: ${input.ad_name}` } };
      }

      case "delete_ad": {
        const data = await metaDelete(`/${input.ad_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "delete_adcreative": {
        const data = await metaDelete(`/${input.creative_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "delete_customaudience": {
        const data = await metaDelete(`/${input.audience_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        const data = await metaPost(`/act_${accountId}/adimages`, token, {
          filename: input.name,
          url: input.url,
        });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "delete_adimage": {
        const data = await metaPost(`/act_${accountId}/adimages`, token, { hash: input.image_hash });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "enable_adrule": {
        const data = await metaPost(`/${input.rule_id}`, token, { status: "ENABLED" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Enabled rule: ${input.rule_name}` } };
      }

      case "disable_adrule": {
        const data = await metaPost(`/${input.rule_id}`, token, { status: "DISABLED" });
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Disabled rule: ${input.rule_name}` } };
      }

      case "delete_adrule": {
        const data = await metaDelete(`/${input.rule_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data };
      }

      case "delete_customconversion": {
        const data = await metaDelete(`/${input.conversion_id}`, token);
        if (data.error) return { success: false, error: buildMetaError(data.error) };
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
        if (data.error) return { success: false, error: buildMetaError(data.error) };
        return { success: true, data: { message: `Deleted product ${input.product_name}` } };
      }

      // ── ACCOUNT BRAIN ──────────────────────────────────────────────────────

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

        const campaignBody: Record<string, any> = {
          name: campaignName,
          objective: tmpl.objective,
          status,
          special_ad_categories: tmpl.special_ad_categories,
          buying_type: "AUCTION",
        };
        if (tmpl.id === "cbo_scaling") {
          campaignBody.daily_budget = dailyBudgetCents;
        }

        const campaignData = await metaPost(`/act_${accountId}/campaigns`, token, campaignBody);
        if (!campaignData || campaignData.error) {
          return { success: false, error: `Campaign creation failed: ${buildMetaError(campaignData?.error ?? campaignData)}` };
        }
        const campaignId: string = campaignData.id;

        let pixelId: string | undefined = input.pixel_id;
        if (!pixelId && (tmpl.objective === "OUTCOME_SALES" || tmpl.objective === "OUTCOME_LEADS")) {
          try {
            const pixelData = await metaGet(`/act_${accountId}/adspixels`, token, { fields: "id,name", limit: "1" });
            if (Array.isArray(pixelData.data) && pixelData.data[0]?.id) {
              pixelId = String(pixelData.data[0].id);
            }
          } catch (_) {}
        }

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
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          };
          if (adsetBudget) adsetBody.daily_budget = String(adsetBudget);
          if (pixelId && (tmpl.objective === "OUTCOME_SALES" || tmpl.objective === "OUTCOME_LEADS")) {
            adsetBody.promoted_object = JSON.stringify({
              pixel_id: pixelId,
              custom_event_type: tmpl.objective === "OUTCOME_LEADS" ? "LEAD" : "PURCHASE",
            });
          }

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
