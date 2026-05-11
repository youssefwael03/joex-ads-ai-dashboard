import { useQuery } from "@tanstack/react-query";
import { metaApi } from "@/lib/metaApi";

export const useMe = (enabled: boolean) =>
  useQuery({
    queryKey: ["meta", "me"],
    queryFn: () => metaApi.getMe(),
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

export const useAdAccounts = (enabled: boolean) =>
  useQuery({
    queryKey: ["meta", "ad-accounts"],
    queryFn: () => metaApi.getAdAccounts(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

export const useAccountInfo = (accountId: string | null) =>
  useQuery({
    queryKey: ["meta", "account-info", accountId],
    queryFn: () => metaApi.getAccountInfo(accountId!),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useInsights = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "insights", accountId, since, until],
    queryFn: () => metaApi.getInsights(accountId!, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useInsightsDaily = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "insights-daily", accountId, since, until],
    queryFn: () => metaApi.getInsightsDaily(accountId!, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useInsightsBreakdown = (
  accountId: string | null,
  breakdown: string,
  since: string,
  until: string,
) =>
  useQuery({
    queryKey: ["meta", "insights-breakdown", accountId, breakdown, since, until],
    queryFn: () => metaApi.getInsightsBreakdown(accountId!, breakdown, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useCampaigns = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "campaigns", accountId, since, until],
    queryFn: () => metaApi.getCampaigns(accountId!, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useAdSets = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "adsets", accountId, since, until],
    queryFn: () => metaApi.getAdSets(accountId!, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const useAds = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "ads", accountId, since, until],
    queryFn: () => metaApi.getAds(accountId!, since, until),
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });

export const usePages = (enabled: boolean) =>
  useQuery({
    queryKey: ["meta", "pages"],
    queryFn: () => metaApi.getPages(),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

export const useInstagram = (pageId: string | null) =>
  useQuery({
    queryKey: ["meta", "instagram", pageId],
    queryFn: () => metaApi.getInstagram(pageId!),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useLeadForms = (pageId: string | null) =>
  useQuery({
    queryKey: ["meta", "lead-forms", pageId],
    queryFn: () => metaApi.getLeadForms(pageId!),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
  });

export const useLeads = (formId: string | null, pageId?: string | null) =>
  useQuery({
    queryKey: ["meta", "leads", formId, pageId],
    queryFn: () => metaApi.getLeads(formId!, pageId ?? undefined),
    enabled: !!formId,
    staleTime: 2 * 60 * 1000,
  });

export const useCatalogs = (businessId: string | null) =>
  useQuery({
    queryKey: ["meta", "catalogs", businessId],
    queryFn: () => metaApi.getCatalogs(businessId!),
    enabled: !!businessId,
    staleTime: 10 * 60 * 1000,
  });

export const useCatalogProducts = (catalogId: string | null) =>
  useQuery({
    queryKey: ["meta", "catalog-products", catalogId],
    queryFn: () => metaApi.getCatalogProducts(catalogId!),
    enabled: !!catalogId,
    staleTime: 5 * 60 * 1000,
  });
