export const fetchMeta = async (endpoint: string, params?: Record<string, string>) => {
  const token = localStorage.getItem("joex_ads_token");
  if (!token) throw new Error("No Meta token found");

  const url = new URL(`/api/meta${endpoint}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.append(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      "X-Meta-Token": token,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Meta API Error: ${res.statusText}`);
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
  getAdSets: (accountId: string) => fetchMeta("/adsets", { account_id: accountId }),
  getAds: (accountId: string) => fetchMeta("/ads", { account_id: accountId }),
  getPages: () => fetchMeta("/pages"),
  getInstagram: (pageId: string) => fetchMeta("/instagram", { page_id: pageId }),
  getLeads: (formId: string) => fetchMeta("/leads", { form_id: formId }),
  getLeadForms: (pageId: string) => fetchMeta("/lead-forms", { page_id: pageId }),
  getCatalogs: (businessId: string) => fetchMeta("/catalogs", { business_id: businessId }),
  getCatalogProducts: (catalogId: string) => fetchMeta("/catalog-products", { catalog_id: catalogId }),
};
