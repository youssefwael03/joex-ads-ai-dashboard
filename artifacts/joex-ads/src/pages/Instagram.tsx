import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { usePages, useInstagram } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Instagram as InstagramIcon, Users, Eye, Heart, AlertCircle, CheckCircle2, XCircle, Loader } from "lucide-react";

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Users; color: string }) {
  return (
    <Card className="bg-card/40 border-card-border">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-bold font-mono mt-0.5">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Instagram() {
  const { token } = useAuthStore();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const { data: pagesData, isLoading: pagesLoading } = usePages(!!token);
  const { data: igData, isLoading: igLoading } = useInstagram(selectedPageId);

  const pages: any[] = pagesData?.data ?? [];
  const igAccount = igData?.instagram_business_account;
  const igInsights = igAccount?.insights?.data ?? [];

  const getInsightValue = (name: string) => {
    const metric = igInsights.find((m: any) => m.name === name);
    const values: any[] = metric?.values ?? [];
    return values.reduce((sum: number, v: any) => sum + (v.value ?? 0), 0);
  };

  const followers = igAccount?.followers_count ?? 0;
  const mediaCount = igAccount?.media_count ?? 0;
  const totalImpressions = getInsightValue("impressions");
  const totalReach = getInsightValue("reach");
  const profileViews = getInsightValue("profile_views");

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <InstagramIcon className="h-8 w-8 text-pink-500" />
          Instagram Insights
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Profile analytics from your linked Instagram Business Account.
        </p>
      </div>

      {/* Connection status bar */}
      <div className="flex items-center gap-3 text-sm">
        {pagesLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground"><Loader className="h-4 w-4 animate-spin" /> Loading pages...</span>
        ) : pages.length > 0 && !selectedPageId ? (
          <span className="flex items-center gap-1.5 text-amber-400"><AlertCircle className="h-4 w-4" /> Select a Facebook page to load Instagram data</span>
        ) : selectedPageId && igLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground"><Loader className="h-4 w-4 animate-spin" /> Fetching Instagram account...</span>
        ) : selectedPageId && igAccount ? (
          <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Connected — @{igAccount.username}</span>
        ) : selectedPageId && !igAccount ? (
          <span className="flex items-center gap-1.5 text-red-400"><XCircle className="h-4 w-4" /> No Instagram Business Account linked to this page</span>
        ) : null}
      </div>

      {/* Page Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground shrink-0">Facebook Page:</label>
        {pagesLoading ? (
          <Skeleton className="h-9 w-[260px]" />
        ) : pages.length === 0 ? (
          <span className="text-sm text-muted-foreground">No pages found. Check your token permissions.</span>
        ) : (
          <Select onValueChange={setSelectedPageId} value={selectedPageId ?? ""}>
            <SelectTrigger className="w-[280px] bg-card/40 border-card-border">
              <SelectValue placeholder="Select a Facebook Page..." />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page: any) => (
                <SelectItem key={page.id} value={page.id}>
                  {page.name}
                  {page.fan_count ? ` (${Number(page.fan_count).toLocaleString()} fans)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!selectedPageId && !pagesLoading && (
        <Card className="bg-card/40 border-card-border max-w-xl">
          <CardContent className="flex items-center gap-4 pt-6 pb-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="font-medium text-sm">Select a Facebook Page above</div>
              <div className="text-xs text-muted-foreground mt-1">
                Your token needs <code className="bg-muted px-1 rounded text-[11px]">instagram_basic</code> and{" "}
                <code className="bg-muted px-1 rounded text-[11px]">instagram_manage_insights</code> permissions,
                and the page must have an Instagram Business Account linked.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPageId && igLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {selectedPageId && !igLoading && !igAccount && (
        <Card className="bg-card/40 border-card-border max-w-xl">
          <CardContent className="flex items-center gap-4 pt-6 pb-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="font-medium text-sm">No Instagram Business Account found</div>
              <div className="text-xs text-muted-foreground mt-1">
                This Facebook Page doesn't have an Instagram Business Account linked, or your token lacks the required permissions.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {igAccount && !igLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Profile header */}
          <Card className="bg-card/40 border-card-border">
            <CardContent className="flex items-center gap-5 pt-5 pb-5">
              {igAccount.profile_picture_url ? (
                <img
                  src={igAccount.profile_picture_url}
                  alt={igAccount.username}
                  className="h-16 w-16 rounded-full border-2 border-pink-500/50 object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                  <InstagramIcon className="h-8 w-8 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg">@{igAccount.username}</span>
                  <Badge className="bg-pink-500/20 text-pink-400 border-pink-500/30">Business</Badge>
                </div>
                {igAccount.biography && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{igAccount.biography}</p>
                )}
                {igAccount.website && (
                  <a
                    href={igAccount.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-0.5 inline-block"
                  >
                    {igAccount.website}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricCard label="Followers" value={Number(followers).toLocaleString()} icon={Users} color="bg-pink-500/15 text-pink-400" />
            <MetricCard label="Total Posts" value={Number(mediaCount).toLocaleString()} icon={InstagramIcon} color="bg-purple-500/15 text-purple-400" />
            {totalImpressions > 0 && <MetricCard label="Impressions (period)" value={Number(totalImpressions).toLocaleString()} icon={Eye} color="bg-blue-500/15 text-blue-400" />}
            {totalReach > 0 && <MetricCard label="Reach (period)" value={Number(totalReach).toLocaleString()} icon={Eye} color="bg-cyan-500/15 text-cyan-400" />}
            {profileViews > 0 && <MetricCard label="Profile Views" value={Number(profileViews).toLocaleString()} icon={Heart} color="bg-orange-500/15 text-orange-400" />}
          </div>

          {/* Daily insights table */}
          {igInsights.length > 0 && (
            <Card className="bg-card/40 border-card-border">
              <CardHeader>
                <CardTitle className="text-base">Daily Metric Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {igInsights.map((metric: any) => (
                    <div key={metric.name} className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground capitalize">
                        {metric.name.replace(/_/g, " ")}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {(metric.values ?? []).slice(-14).map((v: any, i: number) => (
                          <div key={i} className="text-[10px] bg-card/60 border border-border/40 rounded px-2 py-1">
                            <span className="text-muted-foreground">{v.end_time?.slice(5, 10)}: </span>
                            <span className="font-mono font-semibold">{Number(v.value ?? 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
