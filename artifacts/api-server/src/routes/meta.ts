import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const META_BASE = "https://graph.facebook.com/v22.0";

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

async function metaPost(
  path: string,
  token: string,
  body: Record<string, string>,
): Promise<{ data: unknown; status: number }> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  return { data, status: res.status };
}

async function getPageToken(pageId: string, userToken: string): Promise<string> {
  try {
    const { data } = await metaFetch(`/${pageId}`, userToken, { fields: "access_token" });
    return (data as any)?.access_token ?? userToken;
  } catch {
    return userToken;
  }
}

function getToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers["x-meta-token"];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id;
}

function qs(val: unknown): string | undefined {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0] as string;
  return undefined;
}

function insightDateParam(since?: string, until?: string): string {
  if (since && until) {
    return `.time_range(${JSON.stringify({ since, until })})`;
  }
  return `.date_preset(last_30d)`;
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

router.get("/meta/account-info", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const { data, status } = await metaFetch(`/act_${accountId}`, token, {
    fields: "id,name,currency,balance,spend_cap,amount_spent,account_status,business,timezone_name,min_daily_budget,funding_source_details",
  });
  res.status(status).json(data);
});

router.get("/meta/insights", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = qs(req.query.since);
  const until = qs(req.query.until);
  const level = qs(req.query.level) ?? "account";

  const dateParams: Record<string, string> = since && until
    ? { time_range: JSON.stringify({ since, until }) }
    : { date_preset: "last_30d" };

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,unique_clicks,outbound_clicks",
    level,
    ...dateParams,
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/insights-daily", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = qs(req.query.since);
  const until = qs(req.query.until);

  const dateParams: Record<string, string> = since && until
    ? { time_range: JSON.stringify({ since, until }) }
    : { date_preset: "last_30d" };

  const params: Record<string, string> = {
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas",
    time_increment: "1",
    level: "account",
    ...dateParams,
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/insights-breakdown", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const breakdown = qs(req.query.breakdown) ?? "country";
  const since = qs(req.query.since);
  const until = qs(req.query.until);

  const dateParams: Record<string, string> = since && until
    ? { time_range: JSON.stringify({ since, until }) }
    : { date_preset: "last_30d" };

  const params: Record<string, string> = {
    fields: "spend,impressions,reach,clicks,ctr,cpm,cpc",
    breakdowns: breakdown,
    level: "account",
    ...dateParams,
  };

  const { data, status } = await metaFetch(`/act_${accountId}/insights`, token, params);
  res.status(status).json(data);
});

router.get("/meta/campaigns", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = qs(req.query.since);
  const until = qs(req.query.until);

  const dateParam = insightDateParam(since, until);
  const insightFields = "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas,unique_clicks";

  const params: Record<string, string> = {
    fields: `id,name,status,objective,budget_remaining,daily_budget,lifetime_budget,insights${dateParam}{${insightFields}}`,
    limit: "100",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/campaigns`, token, params);
  res.status(status).json(data);
});

router.get("/meta/adsets", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = qs(req.query.since);
  const until = qs(req.query.until);

  const dateParam = insightDateParam(since, until);
  const insightFields = "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas";

  const params: Record<string, string> = {
    fields: `id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,insights${dateParam}{${insightFields}}`,
    limit: "200",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/adsets`, token, params);
  res.status(status).json(data);
});

router.get("/meta/ads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const rawId = qs(req.query.account_id);
  if (!rawId) { res.status(400).json({ error: "account_id is required" }); return; }
  const accountId = normalizeAccountId(rawId);

  const since = qs(req.query.since);
  const until = qs(req.query.until);

  const dateParam = insightDateParam(since, until);
  const insightFields = "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,cost_per_action_type,purchase_roas";

  const params: Record<string, string> = {
    fields: `id,name,status,adset_id,campaign_id,creative{id,name,thumbnail_url,image_url,video_id,body,title,call_to_action_type},insights${dateParam}{${insightFields}}`,
    limit: "200",
  };

  const { data, status } = await metaFetch(`/act_${accountId}/ads`, token, params);
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

router.get("/meta/instagram", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const pageId = qs(req.query.page_id);
  if (!pageId) { res.status(400).json({ error: "page_id is required" }); return; }

  const pageToken = await getPageToken(pageId, token);

  try {
    const { data, status } = await metaFetch(`/${pageId}`, pageToken, {
      fields: [
        "instagram_business_account{",
        "id,name,biography,followers_count,media_count,profile_picture_url,username,website,",
        "insights.metric(follower_count,impressions,reach,profile_views).period(day)",
        "}",
      ].join(""),
    });

    const igAccount = (data as any)?.instagram_business_account;

    if (!igAccount) {
      res.status(200).json({ instagram_business_account: null, debug: { pageId, hasPageToken: pageToken !== token } });
      return;
    }

    res.status(status).json(data);
  } catch (err: any) {
    logger.error({ err, pageId }, "Instagram fetch error");
    res.status(502).json({ error: err?.message ?? "Instagram API error", instagram_business_account: null });
  }
});

router.get("/meta/leads", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const formId = qs(req.query.form_id);
  if (!formId) { res.status(400).json({ error: "form_id is required" }); return; }

  const pageId = qs(req.query.page_id);
  let effectiveToken = token;
  if (pageId) {
    effectiveToken = await getPageToken(pageId, token);
  }

  const { data, status } = await metaFetch(`/${formId}/leads`, effectiveToken, {
    fields: "id,created_time,field_data,ad_id,ad_name,adset_id,campaign_id",
    limit: "100",
  });
  res.status(status).json(data);
});

router.get("/meta/lead-forms", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const pageId = qs(req.query.page_id);
  if (!pageId) { res.status(400).json({ error: "page_id is required" }); return; }

  const pageToken = await getPageToken(pageId, token);

  const { data, status } = await metaFetch(`/${pageId}/leadgen_forms`, pageToken, {
    fields: "id,name,status,leads_count,created_time,questions",
  });
  res.status(status).json(data);
});

router.get("/meta/catalogs", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const businessId = qs(req.query.business_id);
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

  const catalogId = qs(req.query.catalog_id);
  if (!catalogId) { res.status(400).json({ error: "catalog_id is required" }); return; }

  const { data, status } = await metaFetch(`/${catalogId}/products`, token, {
    fields: "id,name,price,sale_price,currency,image_url,url,availability",
    limit: "50",
  });
  res.status(status).json(data);
});

router.post("/meta/campaigns/:id/status", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const { id } = req.params;
  const { status: newStatus } = req.body as { status?: string };

  if (!newStatus || !["ACTIVE", "PAUSED"].includes(newStatus)) {
    res.status(400).json({ error: "status must be ACTIVE or PAUSED" });
    return;
  }

  const { data, status } = await metaPost(`/${id}`, token, { status: newStatus });
  res.status(status).json(data);
});

router.post("/meta/campaigns/:id/budget", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const { id } = req.params;
  const { daily_budget } = req.body as { daily_budget?: number };

  if (!daily_budget || Number(daily_budget) <= 0) {
    res.status(400).json({ error: "daily_budget must be a positive number" });
    return;
  }

  const budgetCents = String(Math.round(Number(daily_budget) * 100));
  const { data, status } = await metaPost(`/${id}`, token, { daily_budget: budgetCents });
  res.status(status).json(data);
});

router.post("/meta/adsets/:id/status", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const { id } = req.params;
  const { status: newStatus } = req.body as { status?: string };

  if (!newStatus || !["ACTIVE", "PAUSED"].includes(newStatus)) {
    res.status(400).json({ error: "status must be ACTIVE or PAUSED" });
    return;
  }

  const { data, status } = await metaPost(`/${id}`, token, { status: newStatus });
  res.status(status).json(data);
});

router.post("/meta/adsets/:id/budget", async (req, res): Promise<void> => {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-Meta-Token header" }); return; }

  const { id } = req.params;
  const { daily_budget } = req.body as { daily_budget?: number };

  if (!daily_budget || Number(daily_budget) <= 0) {
    res.status(400).json({ error: "daily_budget must be a positive number" });
    return;
  }

  const budgetCents = String(Math.round(Number(daily_budget) * 100));
  const { data, status } = await metaPost(`/${id}`, token, { daily_budget: budgetCents });
  res.status(status).json(data);
});

logger.info("Meta proxy routes registered");

export default router;
