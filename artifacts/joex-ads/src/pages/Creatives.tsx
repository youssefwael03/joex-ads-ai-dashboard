import { useState, useMemo } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAds } from "@/hooks/useMeta";
import { useFormatCurrency } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { Image as ImageIcon, PlayCircle, TrendingUp, TrendingDown, Minus, LayoutDashboard, Zap } from "lucide-react";
import { safeNum, getPurchaseRoas, getAction } from "@/lib/metaApi";

type Tier = "Winner" | "Strong" | "Average" | "Weak" | "No Data";
type SortKey = "score" | "roas" | "spend" | "ctr" | "cpc" | "cpa";

const TIER_META: Record<Tier, { color: string; bg: string; border: string; icon: typeof TrendingUp; label: string }> = {
  Winner:    { color: "text-yellow-300",       bg: "bg-yellow-400/15",    border: "border-yellow-400/40",    icon: TrendingUp,   label: "Winner" },
  Strong:    { color: "text-green-400",         bg: "bg-green-500/10",     border: "border-green-500/30",     icon: TrendingUp,   label: "Strong" },
  Average:   { color: "text-blue-400",          bg: "bg-blue-500/10",      border: "border-blue-500/30",      icon: Minus,        label: "Average" },
  Weak:      { color: "text-red-400",           bg: "bg-red-500/10",       border: "border-red-500/30",       icon: TrendingDown, label: "Weak" },
  "No Data": { color: "text-muted-foreground",  bg: "bg-muted/20",         border: "border-border",           icon: Minus,        label: "No Data" },
};

function scoreAd(roas: number, ctr: number, cpc: number, frequency: number, spend: number, cpa: number, avgCpa: number): number {
  let score = 0;
  // ROAS — biggest signal (max 40 pts)
  score += Math.min(roas * 13, 40);
  // CTR — creative hook strength (max 25 pts)
  score += Math.min(ctr * 8, 25);
  // Frequency — lower is better (max 15 pts)
  score += Math.max(0, 15 - frequency * 2.5);
  // Spend signal — validated creative gets budget (max 10 pts)
  score += spend > 500 ? 10 : spend > 100 ? 6 : spend > 20 ? 3 : 0;
  // CPC penalty — expensive clicks hurt score (max -15 pts)
  score -= cpc > 5 ? Math.min((cpc - 5) * 2, 15) : cpc > 2 ? Math.min((cpc - 2) * 1.5, 8) : 0;
  // CPA bonus — beating average CPA is a strong signal (max 10 pts)
  if (avgCpa > 0 && cpa > 0) {
    if (cpa < avgCpa * 0.6) score += 10;
    else if (cpa < avgCpa * 0.85) score += 5;
    else if (cpa > avgCpa * 2) score -= 8;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getTier(score: number, hasData: boolean): Tier {
  if (!hasData) return "No Data";
  if (score >= 72) return "Winner";
  if (score >= 50) return "Strong";
  if (score >= 30) return "Average";
  return "Weak";
}

function getCreativeInsight(tier: Tier, roas: number, ctr: number, frequency: number, cpa: number, avgCpa: number): string {
  if (tier === "No Data") return "No performance data yet.";
  if (tier === "Winner") {
    if (frequency > 3.5) return "Top performer — but frequency rising. Prep a refresh.";
    return `Strong ROAS ${roas.toFixed(2)}x with healthy CTR. Scale budget 20% every 48h.`;
  }
  if (tier === "Strong") {
    if (ctr < 1) return "Good conversions but CTR is low. Test a stronger hook.";
    return `Solid performer. Monitor frequency and scale if ROAS holds.`;
  }
  if (tier === "Average") {
    if (ctr < 0.5) return "Low CTR — creative hook isn't resonating. Test new opening.";
    if (frequency > 4) return "Fatigue setting in. Rotate creative or refresh copy.";
    return "Mid-tier. Needs stronger CTA or better audience targeting.";
  }
  if (tier === "Weak") {
    if (roas < 1 && roas > 0) return `ROAS ${roas.toFixed(2)}x is below breakeven. Pause and reallocate.`;
    if (ctr < 0.3) return "Very low CTR — audience mismatch or weak creative. Replace.";
    return "Below-average performance. Review creative and targeting.";
  }
  return "";
}

function NoAccountState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
        <p className="text-muted-foreground text-sm max-w-xs">Choose an ad account to view your creative gallery.</p>
      </div>
    </div>
  );
}

export default function Creatives() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useAds(selectedAccountId, since, until);
  const fmt = useFormatCurrency();

  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [filterTier, setFilterTier] = useState<Tier | "All">("All");

  if (!selectedAccountId) return <NoAccountState />;

  const rawAds: any[] = data?.data ?? [];

  const enriched = useMemo(() => {
    // First pass: get all CPAs to compute average
    const withBasics = rawAds.map((ad: any) => {
      const ci = ad.insights?.data?.[0] ?? {};
      const spend = safeNum(ci.spend);
      const purchases = getAction(ci.actions, "offsite_conversion.fb_pixel_purchase") || getAction(ci.actions, "purchase");
      const cpa = purchases > 0 ? spend / purchases : 0;
      return { ad, spend, purchases, cpa, ci };
    });

    const validCpas = withBasics.filter((x) => x.cpa > 0).map((x) => x.cpa);
    const avgCpa = validCpas.length > 0 ? validCpas.reduce((a, b) => a + b, 0) / validCpas.length : 0;

    return withBasics.map(({ ad, spend, purchases, cpa, ci }) => {
      const roas = getPurchaseRoas(ci.purchase_roas);
      const ctr = safeNum(ci.ctr);
      const cpc = safeNum(ci.cpc);
      const cpm = safeNum(ci.cpm);
      const frequency = safeNum(ci.frequency);
      const impressions = safeNum(ci.impressions);
      const reach = safeNum(ci.reach);
      const clicks = safeNum(ci.clicks);
      const hasData = spend > 0 || impressions > 0;
      const score = hasData ? scoreAd(roas, ctr, cpc, frequency, spend, cpa, avgCpa) : 0;
      const tier = getTier(score, hasData);
      const creativeUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
      const isVideo = !!ad.creative?.video_id || !!ad.creative?.thumbnail_url;
      const insight = getCreativeInsight(tier, roas, ctr, frequency, cpa, avgCpa);
      const creativeBody = ad.creative?.body ?? ad.creative?.title ?? null;
      const ctaType = ad.creative?.call_to_action_type ?? null;
      return {
        ad, spend, roas, ctr, cpc, cpm, frequency, score, tier, creativeUrl,
        isVideo, hasData, cpa, purchases, impressions, reach, clicks, insight,
        creativeBody, ctaType, avgCpa,
      };
    });
  }, [rawAds]);

  const filtered = useMemo(
    () => enriched.filter((e) => filterTier === "All" || e.tier === filterTier),
    [enriched, filterTier],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "score")  return b.score - a.score;
      if (sortBy === "roas")   return b.roas - a.roas;
      if (sortBy === "spend")  return b.spend - a.spend;
      if (sortBy === "ctr")    return b.ctr - a.ctr;
      if (sortBy === "cpc")    return a.cpc - b.cpc;
      if (sortBy === "cpa")    return (a.cpa || Infinity) - (b.cpa || Infinity);
      return 0;
    });
  }, [filtered, sortBy]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of enriched) counts[e.tier] = (counts[e.tier] ?? 0) + 1;
    return counts;
  }, [enriched]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Creative Intelligence</h2>
          <p className="text-muted-foreground mt-1 text-sm">AI-scored creative gallery ranked by live performance data.</p>
        </div>
        {!isLoading && enriched.length > 0 && (
          <Badge variant="outline" className="font-mono text-xs">{enriched.length} creatives analyzed</Badge>
        )}
      </div>

      {/* Tier summary bar */}
      {!isLoading && enriched.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterTier === "All" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterTier("All")}
            className="h-8 text-xs"
          >
            All ({enriched.length})
          </Button>
          {(["Winner", "Strong", "Average", "Weak", "No Data"] as Tier[]).map((tier) => {
            const count = tierCounts[tier] ?? 0;
            if (count === 0) return null;
            const meta = TIER_META[tier];
            return (
              <Button
                key={tier}
                variant="outline"
                size="sm"
                onClick={() => setFilterTier(filterTier === tier ? "All" : tier)}
                className={`h-8 text-xs border transition-all ${
                  filterTier === tier
                    ? `${meta.bg} ${meta.border} ${meta.color}`
                    : "border-border text-muted-foreground hover:border-border"
                }`}
              >
                {tier} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Sort controls */}
      {!isLoading && sorted.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-card/40 border-card-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">AI Score</SelectItem>
              <SelectItem value="roas">ROAS</SelectItem>
              <SelectItem value="spend">Spend (high)</SelectItem>
              <SelectItem value="ctr">CTR (high)</SelectItem>
              <SelectItem value="cpc">CPC (low)</SelectItem>
              <SelectItem value="cpa">CPA (low)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{sorted.length} creative{sorted.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center text-muted-foreground py-20">
          {enriched.length === 0
            ? "No ads found for this account and date range."
            : `No creatives in the "${filterTier}" tier.`}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sorted.map(({ ad, spend, roas, ctr, cpc, cpa, score, tier, creativeUrl, isVideo, insight, ctaType }, i) => {
            const meta = TIER_META[tier];
            const TierIcon = meta.icon;
            return (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.025, 0.4) }}
              >
                <Card className="bg-card/40 border-card-border overflow-hidden group hover:border-primary/20 transition-all duration-300 hover:shadow-[0_0_20px_rgba(252,211,77,0.05)]">
                  {/* Creative thumbnail */}
                  <div className="aspect-square bg-muted relative flex items-center justify-center overflow-hidden">
                    {creativeUrl ? (
                      <img
                        src={creativeUrl}
                        alt={ad.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                    )}
                    {isVideo && (
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm p-1 rounded-full">
                        <PlayCircle className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    {/* AI Score overlay */}
                    {tier !== "No Data" && (
                      <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm ${meta.bg} ${meta.border} border ${meta.color}`}>
                        <Zap className="h-2.5 w-2.5" />
                        {score}
                      </div>
                    )}
                    {/* Status badge */}
                    <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-medium backdrop-blur-sm ${
                      ad.status === "ACTIVE" ? "bg-green-500/25 text-green-400" : "bg-muted/60 text-muted-foreground"
                    }`}>
                      {ad.status}
                    </div>
                    {/* CTA type */}
                    {ctaType && (
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-medium backdrop-blur-sm bg-black/50 text-white/70">
                        {ctaType.replace(/_/g, " ")}
                      </div>
                    )}
                  </div>

                  <CardContent className="p-3 space-y-2">
                    {/* Tier badge */}
                    <div className="flex items-center justify-between gap-1">
                      <Badge className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${meta.bg} ${meta.border} border ${meta.color} hover:opacity-90`}>
                        <TierIcon className="h-2 w-2 mr-0.5" />
                        {tier}
                      </Badge>
                      {tier !== "No Data" && (
                        <span className="text-[9px] text-muted-foreground font-mono">{score}/100</span>
                      )}
                    </div>

                    {/* Ad name */}
                    <h4 className="font-medium text-xs line-clamp-2 text-foreground leading-tight">{ad.name}</h4>

                    {/* Metrics */}
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">ROAS</span>
                        <span className={`font-mono text-[11px] font-semibold ${roas >= 2 ? "text-primary" : roas > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                          {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">Spend</span>
                        <span className="font-mono text-[11px]">{spend > 0 ? fmt(spend) : "—"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">CTR</span>
                        <span className={`font-mono text-[11px] ${ctr >= 2 ? "text-green-400" : ctr >= 1 ? "text-foreground" : "text-muted-foreground"}`}>
                          {ctr > 0 ? `${ctr.toFixed(2)}%` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground">CPC</span>
                        <span className="font-mono text-[11px]">{cpc > 0 ? fmt(cpc) : "—"}</span>
                      </div>
                      {cpa > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground">CPA</span>
                          <span className="font-mono text-[11px]">{fmt(cpa)}</span>
                        </div>
                      )}
                    </div>

                    {/* AI insight */}
                    {insight && tier !== "No Data" && (
                      <div className={`text-[10px] leading-tight rounded-md px-2 py-1.5 border ${meta.bg} ${meta.border} ${meta.color}`}>
                        {insight}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
