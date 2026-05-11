import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const META_BASE = "https://graph.facebook.com/v19.0";

async function metaFetch(
  path: string,
  token: string,
  params: Record<string, string> = {},
  method = "GET",
  body?: unknown
): Promise<{ data: unknown; status: number }> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), opts);
  const data = await res.json();
  return { data, status: res.status };
}

function getToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers["x-meta-token"];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
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
    fields:
      "id,name,account_id,account_status,currency,timezone_name,business",
    limit: "50",
  });
  res.status(status).json(data);
});

router.get("/meta/insights", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  const since = req.query.since as string;
  const until = req.query.until as string;
  const level = (req.query.level as string) || "account";

  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const params: Record<string, string> = {
    fields:
      "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,cpp",
    level,
    date_preset: "last_30d",
  };
  if (since) params.time_range = JSON.stringify({ since, until: until || since });

  const { data, status } = await metaFetch(
    `/act_${accountId}/insights`,
    token,
    params
  );
  res.status(status).json(data);
});

router.get("/meta/campaigns", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  const params: Record<string, string> = {
    fields:
      "id,name,status,objective,budget_remaining,daily_budget,lifetime_budget,insights{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,quality_ranking,engagement_rate_ranking,conversion_rate_ranking}",
    limit: "100",
  };
  if (since && until) {
    params["insights.time_range"] = JSON.stringify({ since, until });
  }

  const { data, status } = await metaFetch(
    `/act_${accountId}/campaigns`,
    token,
    params
  );
  res.status(status).json(data);
});

router.get("/meta/adsets", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const params: Record<string, string> = {
    fields:
      "id,name,status,campaign_id,targeting,daily_budget,lifetime_budget,insights{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas}",
    limit: "200",
  };

  const { data, status } = await metaFetch(
    `/act_${accountId}/adsets`,
    token,
    params
  );
  res.status(status).json(data);
});

router.get("/meta/ads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const params: Record<string, string> = {
    fields:
      "id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,image_url,video_id},insights{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas}",
    limit: "200",
  };

  const { data, status } = await metaFetch(
    `/act_${accountId}/ads`,
    token,
    params
  );
  res.status(status).json(data);
});

router.get("/meta/instagram", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const pageId = req.query.page_id as string | undefined;
  if (!pageId) {
    res.status(400).json({ error: "page_id is required" });
    return;
  }

  const { data, status } = await metaFetch(`/${pageId}`, token, {
    fields:
      "instagram_business_account{id,name,biography,followers_count,media_count,profile_picture_url,username,website,insights.metric(follower_count,impressions,reach,profile_views).period(day)}",
  });
  res.status(status).json(data);
});

router.get("/meta/pages", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }

  const { data, status } = await metaFetch("/me/accounts", token, {
    fields: "id,name,access_token,category,fan_count,followers_count",
  });
  res.status(status).json(data);
});

router.get("/meta/leads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const formId = req.query.form_id as string | undefined;
  if (!formId) {
    res.status(400).json({ error: "form_id is required" });
    return;
  }

  const { data, status } = await metaFetch(`/${formId}/leads`, token, {
    fields: "id,created_time,field_data,ad_id,ad_name,adset_id,campaign_id",
    limit: "100",
  });
  res.status(status).json(data);
});

router.get("/meta/lead-forms", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const pageId = req.query.page_id as string | undefined;
  if (!pageId) {
    res.status(400).json({ error: "page_id is required" });
    return;
  }

  const { data, status } = await metaFetch(`/${pageId}/leadgen_forms`, token, {
    fields: "id,name,status,leads_count,created_time",
  });
  res.status(status).json(data);
});

router.get("/meta/catalogs", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    res.status(400).json({ error: "business_id is required" });
    return;
  }

  const { data, status } = await metaFetch(
    `/${businessId}/owned_product_catalogs`,
    token,
    {
      fields: "id,name,product_count,vertical",
      limit: "50",
    }
  );
  res.status(status).json(data);
});

router.get("/meta/catalog-products", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const catalogId = req.query.catalog_id as string | undefined;
  if (!catalogId) {
    res.status(400).json({ error: "catalog_id is required" });
    return;
  }

  const { data, status } = await metaFetch(`/${catalogId}/products`, token, {
    fields: "id,name,price,sale_price,currency,image_url,url,availability",
    limit: "50",
  });
  res.status(status).json(data);
});

router.get("/meta/insights-breakdown", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  const breakdown = (req.query.breakdown as string) || "country";
  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc,actions,action_values",
    breakdowns: breakdown,
    level: "account",
    date_preset: "last_30d",
  };

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  if (since && until) {
    params.time_range = JSON.stringify({ since, until });
    delete params.date_preset;
  }

  const { data, status } = await metaFetch(
    `/act_${accountId}/insights`,
    token,
    params
  );
  res.status(status).json(data);
});

router.get("/meta/insights-daily", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing X-Meta-Token header" });
    return;
  }
  const accountId = Array.isArray(req.query.account_id)
    ? req.query.account_id[0]
    : (req.query.account_id as string);
  if (!accountId) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc,actions,action_values,purchase_roas",
    time_increment: "1",
    date_preset: "last_30d",
    level: "account",
  };

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  if (since && until) {
    params.time_range = JSON.stringify({ since, until });
    delete params.date_preset;
  }

  const { data, status } = await metaFetch(
    `/act_${accountId}/insights`,
    token,
    params
  );
  res.status(status).json(data);
});

logger.info("Meta proxy routes registered");

export default router;
