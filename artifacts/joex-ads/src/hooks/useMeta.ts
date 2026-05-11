import { useQuery } from "@tanstack/react-query";
import { metaApi } from "@/lib/metaApi";

export const useMe = (enabled: boolean) =>
  useQuery({
    queryKey: ["meta", "me"],
    queryFn: () => metaApi.getMe(),
    enabled,
    retry: false,
  });

export const useAdAccounts = (enabled: boolean) =>
  useQuery({
    queryKey: ["meta", "ad-accounts"],
    queryFn: () => metaApi.getAdAccounts(),
    enabled,
  });

export const useInsights = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "insights", accountId, since, until],
    queryFn: () => metaApi.getInsights(accountId!, since, until),
    enabled: !!accountId,
  });

export const useInsightsDaily = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "insights-daily", accountId, since, until],
    queryFn: () => metaApi.getInsightsDaily(accountId!, since, until),
    enabled: !!accountId,
  });

export const useInsightsBreakdown = (accountId: string | null, breakdown: string, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "insights-breakdown", accountId, breakdown, since, until],
    queryFn: () => metaApi.getInsightsBreakdown(accountId!, breakdown, since, until),
    enabled: !!accountId,
  });

export const useCampaigns = (accountId: string | null, since: string, until: string) =>
  useQuery({
    queryKey: ["meta", "campaigns", accountId, since, until],
    queryFn: () => metaApi.getCampaigns(accountId!, since, until),
    enabled: !!accountId,
  });

export const useAdSets = (accountId: string | null) =>
  useQuery({
    queryKey: ["meta", "adsets", accountId],
    queryFn: () => metaApi.getAdSets(accountId!),
    enabled: !!accountId,
  });

export const useAds = (accountId: string | null) =>
  useQuery({
    queryKey: ["meta", "ads", accountId],
    queryFn: () => metaApi.getAds(accountId!),
    enabled: !!accountId,
  });
