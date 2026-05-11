import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const META_BASE = "https://graph.facebook.com/v19.0";

async function metaFetch(
  path: string,
  token: string,
  params: Record<string, string> = {},
  retries = 3,
): Promise<{ data: unknown; status: number }> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
      const data = await res.json();
      // Rate-limited — back off and retry
      if (res.status === 429 || (res.status === 400 && (data as any)?.error?.code === 17)) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return { data, status: res.status };
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastErr ?? new Error("Meta fetch failed after retries");
}

function getToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers["x-meta-token"];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Meta returns account IDs as "act_123456789" from /me/adaccounts.
 * Strip the prefix so we can safely reconstruct "/act_{id}/..." paths.
 */
function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id;
}

/** Build the date params block — never send both date_preset and time_range */
function buildDateParams(since?: string, until?: string): Record<string, string> {
  if (since && until) {
    return { time_range: JSON.stringify({ since, until }) };
  }
  return { date_preset: "last_30d" };
}

router.get("/meta/me", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const { data, status } = await metaFetch("/me", token, {
    fields: "id,name,email",
  });
  res.status(status).json(data);
});

router.get("/meta/ad-accounts", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const { data, status } = await metaFetch("/me/adaccounts", token, {
    fields: "id,name,account_id,account_status,currency,timezone_name,business",
    limit: "200",
  });
  res.status(status).json(data);
});

router.get("/meta/insights", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  const level = (req.query.level as string) || "account";

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,unique_clicks,outbound_clicks",
    level,
    ...buildDateParams(since, until),
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/insights-daily", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const params: Record<string, string> = {
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas",
    time_increment: "1",
    level: "account",
    ...buildDateParams(since, until),
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/insights-breakdown", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const breakdown = (req.query.breakdown as string) || "country";
  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc",
    breakdowns: breakdown,
    level: "account",
    ...buildDateParams(since, until),
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/campaigns", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const dateClause = since && until ? `,"insights.time_range":${JSON.stringify({ since, until })}` : "";
  const params: Record<string, string> = {
    fields: `id,name,status,objective,budget_remaining,daily_budget,lifetime_budget,insights${dateClause}{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,quality_ranking,engagement_rate_ranking,conversion_rate_ranking}`,
    limit: "100",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/campaigns`, token, params);
  res.status(status).json(data);
});

router.get("/meta/adsets", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const dateClause = since && until ? `,"insights.time_range":${JSON.stringify({ since, until })}` : "";
  const params: Record<string, string> = {
    fields: `id,name,status,campaign_id,daily_budget,lifetime_budget,insights${dateClause}{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas}`,
    limit: "200",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/adsets`, token, params);
  res.status(status).json(data);
});

router.get("/meta/ads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = Array.isArray(req.query.account_id) ? req.query.account_id[0] : (req.query.account_id as string);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const dateClause = since && until ? `,"insights.time_range":${JSON.stringify({ since, until })}` : "";
  const params: Record<string, string> = {
    fields: `id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,image_url,video_id},insights${dateClause}{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas}`,
    limit: "200",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/ads`, token, params);
  res.status(status).json(data);
});

router.get("/meta/instagram", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const pageId = req.query.page_id as string | undefined;
  if (!pageId) { res.status(400).json({ error: "page_id is required" }); return; }

  const { data, status } = await metaFetch(`/${pageId}`, token, {
    fields: "instagram_business_account{id,name,biography,followers_count,media_count,profile_picture_url,username,website,insights.metric(follower_count,impressions,reach,profile_views).period(day)}",
  });
  res.status(status).json(data);
});

router.get("/meta/pages", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const { data, status } = await metaFetch("/me/accounts", token, {
    fields: "id,name,access_token,category,fan_count,followers_count",
  });
  res.status(status).json(data);
});

router.get("/meta/leads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const formId = req.query.form_id as string | undefined;
  if (!formId) { res.status(400).json({ error: "form_id is required" }); return; }

  const { data, status } = await metaFetch(`/${formId}/leads`, token, {
    fields: "id,created_time,field_data,ad_id,ad_name,adset_id,campaign_id",
    limit: "100",
  });
  res.status(status).json(data);
});

router.get("/meta/lead-forms", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const pageId = req.query.page_id as string | undefined;
  if (!pageId) { res.status(400).json({ error: "page_id is required" }); return; }

  const { data, status } = await metaFetch(`/${pageId}/leadgen_forms`, token, {
    fields: "id,name,status,leads_count,created_time",
  });
  res.status(status).json(data);
});

router.get("/meta/catalogs", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) { res.status(400).json({ error: "business_id is required" }); return; }

  const { data, status } = await metaFetch(`/${businessId}/owned_product_catalogs`, token, {
    fields: "id,name,product_count,vertical",
    limit: "50",
  });
  res.status(status).json(data);
});

router.get("/meta/catalog-products", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const catalogId = req.query.catalog_id as string | undefined;
  if (!catalogId) { res.status(400).json({ error: "catalog_id is required" }); return; }

  const { data, status } = await metaFetch(`/${catalogId}/products`, token, {
    fields: "id,name,price,sale_price,currency,image_url,url,availability",
    limit: "50",
  });
  res.status(status).json(data);
});

logger.info("Meta proxy routes registered");

export default router;
