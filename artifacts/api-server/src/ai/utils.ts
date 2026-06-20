export const META_BASE = "https://graph.facebook.com/v22.0";

export const INSIGHT_FIELDS =
  "spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,action_values,purchase_roas,cost_per_action_type,unique_clicks,outbound_clicks";

export function buildMetaError(err: any): string {
  if (!err || typeof err !== "object") return String(err);
  const parts = [
    err.error_user_title ? String(err.error_user_title) : null,
    err.error_user_msg   ? String(err.error_user_msg)   : (err.message ? String(err.message) : null),
    err.code             ? `(Meta code: ${err.code}${err.error_subcode ? `.${err.error_subcode}` : ""})` : null,
  ].filter(Boolean);
  return parts.join(" — ") || JSON.stringify(err);
}

export async function metaGet(
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

export async function metaPost(
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

export async function metaDelete(
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

export function trimData(data: unknown, maxItems = 80): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data)) {
    return { ...d, data: d.data.slice(0, maxItems) };
  }
  return data;
}
