export const fetchMeta = async (endpoint: string, params?: Record<string, string>) => {
  const token = localStorage.getItem("joex_ads_token");
  if (!token) throw new Error("No Meta token found");

  const url = new URL(`/api/meta${endpoint}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.append(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: { "X-Meta-Token": token },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg = (errorData as any)?.error?.message || (errorData as any)?.error || `Meta API Error: ${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return res.json();
};

export const metaApi = {
  getMe: () => fetchMeta("/me"),
  getAdAccounts: () => fetchMeta("/ad-accounts"),
  getInsights: (accountId: string, since: string, until: string) =>
    fetchMeta("/insights", { account_id: accountId, since, until }),
  getInsightsDaily: (accountId: string, since: string, until: string) =>
    fetchMeta("/insights-daily", { account_id: accountId, since, until }),
  getInsightsBreakdown: (accountId: string, breakdown: string, since: string, until: string) =>
    fetchMeta("/insights-breakdown", { account_id: accountId, breakdown, since, until }),
  getCampaigns: (accountId: string, since: string, until: string) =>
    fetchMeta("/campaigns", { account_id: accountId, since, until }),
  getAdSets: (accountId: string, since: string, until: string) =>
    fetchMeta("/adsets", { account_id: accountId, since, until }),
  getAds: (accountId: string, since: string, until: string) =>
    fetchMeta("/ads", { account_id: accountId, since, until }),
  getPages: () => fetchMeta("/pages"),
  getInstagram: (pageId: string) => fetchMeta("/instagram", { page_id: pageId }),
  getLeads: (formId: string) => fetchMeta("/leads", { form_id: formId }),
  getLeadForms: (pageId: string) => fetchMeta("/lead-forms", { page_id: pageId }),
  getCatalogs: (businessId: string) => fetchMeta("/catalogs", { business_id: businessId }),
  getCatalogProducts: (catalogId: string) => fetchMeta("/catalog-products", { catalog_id: catalogId }),
};

// ── Safe metric parsers ────────────────────────────────────────────────────────

export function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function safeFmt(v: unknown, decimals = 2): string {
  return safeNum(v).toFixed(decimals);
}

export function fmtCurrency(v: unknown, currency = "USD"): string {
  const n = safeNum(v);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function fmtNumber(v: unknown): string {
  return safeNum(v).toLocaleString("en-US");
}

/** Extracts a named action value from Meta's actions[] array */
export function getAction(actions: any[] | undefined, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const match = actions.find((a) => a.action_type === type);
  return safeNum(match?.value);
}

/** Extracts purchase ROAS from Meta's purchase_roas[] array */
export function getPurchaseRoas(roas: any[] | undefined): number {
  if (!Array.isArray(roas) || roas.length === 0) return 0;
  return safeNum(roas[0]?.value);
}
