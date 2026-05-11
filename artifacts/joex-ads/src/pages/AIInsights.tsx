import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useCampaigns, useInsights } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  AlertTriangle, TrendingUp, TrendingDown, Target, BrainCircuit, LayoutDashboard,
  Zap, DollarSign, BarChart3,
} from "lucide-react";
import { safeNum, getPurchaseRoas, getAction, fmtNumber } from "@/lib/metaApi";

interface CampaignInsight {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  impressions: number;
  clicks: number;
  reach: number;
  purchases: number;
  cpa: number;
  revenue: number;
}

interface EnrichedCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insight: CampaignInsight;
}

function extractInsight(c: any): CampaignInsight {
  const d = c.insights?.data?.[0] ?? {};
  const spend = safeNum(d.spend);
  const roas = getPurchaseRoas(d.purchase_roas);
  const purchases = getAction(d.actions, "offsite_conversion.fb_pixel_purchase")
    || getAction(d.actions, "purchase")
    || getAction(d.actions, "omni_purchase");
  return {
    spend,
    roas,
    ctr: safeNum(d.ctr),
    cpc: safeNum(d.cpc),
    cpm: safeNum(d.cpm),
    frequency: safeNum(d.frequency),
    impressions: safeNum(d.impressions),
    clicks: safeNum(d.clicks),
    reach: safeNum(d.reach),
    purchases,
    cpa: purchases > 0 ? spend / purchases : 0,
    revenue: spend * roas,
  };
}

function segmentCampaigns(campaigns: EnrichedCampaign[]) {
  const segments: Record<string, EnrichedCampaign[]> = {
    Winners: [],
    "Scaling Opps": [],
    "Stable Performers": [],
    Fatigued: [],
    "High Risk": [],
    "Low CTR": [],
    "Expensive CPA": [],
    "Creative Fatigue": [],
    "Learning Limited": [],
    "Audience Saturation": [],
  };

  const avgSpend = campaigns.reduce((s, c) => s + c.insight.spend, 0) / Math.max(campaigns.length, 1);
  const validCpas = campaigns.filter((c) => c.insight.cpa > 0).map((c) => c.insight.cpa);
  const avgCpa = validCpas.length > 0 ? validCpas.reduce((a, b) => a + b, 0) / validCpas.length : 0;

  for (const c of campaigns) {
    const { roas, ctr, frequency, spend, purchases, cpa } = c.insight;

    if (roas >= 3 && ctr >= 1.5) {
      segments["Winners"].push(c);
    } else if (roas >= 2 && frequency < 3) {
      segments["Scaling Opps"].push(c);
    }

    if (frequency > 5) {
      segments["Creative Fatigue"].push(c);
      segments["Fatigued"].push(c);
    } else if (frequency > 4) {
      segments["Fatigued"].push(c);
    } else if (frequency > 3.5 && spend > avgSpend * 1.5) {
      segments["Audience Saturation"].push(c);
    }

    if (spend > avgSpend && roas < 1 && roas > 0) {
      segments["High Risk"].push(c);
    } else if (ctr < 0.5 && ctr > 0) {
      segments["Low CTR"].push(c);
    } else if (avgCpa > 0 && cpa > avgCpa * 2.5 && purchases > 0) {
      segments["Expensive CPA"].push(c);
    } else if (c.insight.impressions < 1000 && spend < avgSpend * 0.15) {
      segments["Learning Limited"].push(c);
    } else if (roas >= 1.5 && !segments["Winners"].includes(c) && !segments["Scaling Opps"].includes(c)) {
      segments["Stable Performers"].push(c);
    }
  }

  return segments;
}

function generateRecommendations(
  campaigns: EnrichedCampaign[],
  segments: Record<string, EnrichedCampaign[]>,
  fmt: (v: unknown) => string,
  currency: string,
) {
  const recs: {
    priority: "Critical" | "High" | "Medium" | "Low";
    title: string;
    description: string;
    evidence: string[];
    action: string;
    icon: typeof AlertTriangle;
  }[] = [];

  const avgSpend = campaigns.reduce((s, c) => s + c.insight.spend, 0) / Math.max(campaigns.length, 1);
  const validCpas = campaigns.filter((c) => c.insight.cpa > 0).map((c) => c.insight.cpa);
  const avgCpa = validCpas.length > 0 ? validCpas.reduce((a, b) => a + b, 0) / validCpas.length : 0;
  const totalSpend = campaigns.reduce((s, c) => s + c.insight.spend, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.insight.revenue, 0);
  const accountRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Creative Fatigue
  const fatigued = [...(segments["Fatigued"] ?? [])].sort((a, b) => b.insight.frequency - a.insight.frequency);
  if (fatigued.length > 0) {
    const worst = fatigued[0];
    recs.push({
      priority: "Critical",
      title: `Creative Fatigue — ${fatigued.length} Campaign${fatigued.length > 1 ? "s" : ""}`,
      description: `${fatigued.length} campaign(s) show elevated frequency, signaling audience saturation.`,
      evidence: [
        `"${worst.name.slice(0, 45)}" — frequency ${worst.insight.frequency.toFixed(1)}`,
        `CTR ${worst.insight.ctr.toFixed(2)}% — declining engagement from repetition`,
        `CPM ${fmt(worst.insight.cpm)} — rising costs as algorithm struggles to find fresh users`,
      ],
      action: "Refresh creative assets immediately. Duplicate top ad sets with new creatives. Add 14-day engager exclusion to targeting. Consider broadening audience lookalike percentages.",
      icon: AlertTriangle,
    });
  }

  // Scale winners
  const winners = [...(segments["Winners"] ?? [])].sort((a, b) => b.insight.roas - a.insight.roas);
  if (winners.length > 0) {
    const best = winners[0];
    recs.push({
      priority: "High",
      title: `Scale Winner: "${best.name.slice(0, 35)}"`,
      description: "This campaign is significantly outperforming account averages. Scaling opportunity exists.",
      evidence: [
        `ROAS ${best.insight.roas.toFixed(2)}x vs account avg ${accountRoas.toFixed(2)}x`,
        `CTR ${best.insight.ctr.toFixed(2)}% — strong creative resonance`,
        `Frequency ${best.insight.frequency.toFixed(1)} — audience not yet saturated`,
        `Revenue generated: ${fmt(best.insight.revenue)}`,
      ],
      action: "Increase daily budget by 20% every 48 hours. Duplicate the top-performing ad set to test 2–5% lookalike audiences. Maintain 1-day click attribution window.",
      icon: TrendingUp,
    });
  }

  // Wasted spend
  const highRisk = [...(segments["High Risk"] ?? [])].sort((a, b) => b.insight.spend - a.insight.spend);
  if (highRisk.length > 0) {
    const worst = highRisk[0];
    const totalWasted = highRisk.reduce((s, c) => s + c.insight.spend, 0);
    recs.push({
      priority: "Critical",
      title: `Wasted Spend — ${fmt(totalWasted)} at Risk`,
      description: `${highRisk.length} high-spend campaign(s) delivering ROAS below 1x.`,
      evidence: [
        `"${worst.name.slice(0, 40)}" — spent ${fmt(worst.insight.spend)} → ROAS ${worst.insight.roas.toFixed(2)}x`,
        `Total budget at risk: ${fmt(totalWasted)} (${((totalWasted / totalSpend) * 100).toFixed(0)}% of account spend)`,
        `Every ${currency} spent generates less than ${currency} 1 in return`,
      ],
      action: "Pause these campaigns immediately. Reallocate budget to winners. Run creative audit — identify if the issue is targeting, creative, or landing page. Do not restart without a hypothesis.",
      icon: TrendingDown,
    });
  }

  // Scaling opportunities
  const scalingOpps = segments["Scaling Opps"] ?? [];
  if (scalingOpps.length > 0) {
    const avgRoas = scalingOpps.reduce((s, c) => s + c.insight.roas, 0) / scalingOpps.length;
    const avgFreq = scalingOpps.reduce((s, c) => s + c.insight.frequency, 0) / scalingOpps.length;
    recs.push({
      priority: "High",
      title: `${scalingOpps.length} Scaling Opportunit${scalingOpps.length > 1 ? "ies" : "y"} Identified`,
      description: "Campaigns with healthy ROAS and low frequency have untapped audience potential.",
      evidence: [
        `Average ROAS: ${avgRoas.toFixed(2)}x — above profitability threshold`,
        `Average frequency: ${avgFreq.toFixed(1)} — audience far from saturation`,
        `${scalingOpps.map((c) => c.name.slice(0, 25)).slice(0, 2).join(", ")}${scalingOpps.length > 2 ? ` +${scalingOpps.length - 2} more` : ""}`,
      ],
      action: `Increase budgets 15–25% every 48–72 hours. Target ${fmt(avgSpend * 1.5)} daily budget per campaign. Monitor CPA — stop scaling if CPA rises more than 30% above ${fmt(avgCpa)}.`,
      icon: TrendingUp,
    });
  }

  // Low CTR
  const lowCtr = segments["Low CTR"] ?? [];
  if (lowCtr.length > 0) {
    const avgCtr = lowCtr.reduce((s, c) => s + c.insight.ctr, 0) / lowCtr.length;
    recs.push({
      priority: "Medium",
      title: `Low CTR — ${lowCtr.length} Campaign${lowCtr.length > 1 ? "s" : ""}`,
      description: "Campaigns with CTR below 0.5% waste impression budget without generating enough clicks.",
      evidence: [
        `${lowCtr.length} campaigns averaging ${avgCtr.toFixed(2)}% CTR`,
        "Low CTR = weak creative hook or audience mismatch",
        `Wasted impressions: ${fmtNumber(lowCtr.reduce((s, c) => s + c.insight.impressions, 0))}`,
      ],
      action: "Test 3–5 new creative variations with stronger hooks. Try UGC, before/after, or problem-solution formats. Broaden audience or test Advantage+ targeting. Reduce text overlay on images.",
      icon: Target,
    });
  }

  // Expensive CPA
  const expCpa = segments["Expensive CPA"] ?? [];
  if (expCpa.length > 0 && avgCpa > 0) {
    recs.push({
      priority: "Medium",
      title: `High CPA — ${expCpa.length} Campaign${expCpa.length > 1 ? "s" : ""}`,
      description: `CPA is significantly above account average of ${fmt(avgCpa)}.`,
      evidence: [
        `Account avg CPA: ${fmt(avgCpa)}`,
        `Affected campaigns average ${fmt(expCpa.reduce((s, c) => s + c.insight.cpa, 0) / expCpa.length)} CPA`,
        `${expCpa[0].name.slice(0, 40)} — ${fmt(expCpa[0].insight.cpa)} per purchase`,
      ],
      action: "Review landing page conversion rate. Test price anchoring or urgency elements. Tighten audience targeting. Consider switching to CBO (Campaign Budget Optimization) to let Meta allocate budget efficiently.",
      icon: DollarSign,
    });
  }

  if (recs.length === 0 && campaigns.length > 0) {
    recs.push({
      priority: "Low",
      title: "Account Performance Within Normal Range",
      description: `${campaigns.length} campaigns analyzed. No critical issues detected.`,
      evidence: [
        `Account ROAS: ${accountRoas > 0 ? accountRoas.toFixed(2) + "x" : "No purchase data"}`,
        `Total spend: ${fmt(totalSpend)}`,
        `No severe fatigue, wasted spend, or critical bottlenecks detected`,
      ],
      action: "Maintain current strategy. Review performance weekly. Test new creative variations every 2–3 weeks to prevent future fatigue.",
      icon: Target,
    });
  }

  return recs;
}

const SEGMENT_META: Record<string, { color: string; border: string; desc: string; icon: typeof TrendingUp }> = {
  Winners:             { color: "text-green-400",        border: "border-green-500/20",  desc: "ROAS ≥ 3, CTR ≥ 1.5%", icon: TrendingUp },
  "Scaling Opps":      { color: "text-primary",          border: "border-primary/20",    desc: "ROAS ≥ 2, Freq < 3",    icon: Zap },
  "Stable Performers": { color: "text-blue-400",         border: "border-blue-500/20",   desc: "ROAS 1.5–3, healthy",   icon: BarChart3 },
  Fatigued:            { color: "text-yellow-400",       border: "border-yellow-500/20", desc: "Frequency > 4",         icon: TrendingDown },
  "High Risk":         { color: "text-destructive",      border: "border-destructive/20", desc: "High spend, ROAS < 1", icon: AlertTriangle },
  "Low CTR":           { color: "text-orange-400",       border: "border-orange-500/20", desc: "CTR < 0.5%",            icon: TrendingDown },
  "Expensive CPA":     { color: "text-pink-400",         border: "border-pink-500/20",   desc: "CPA > 2.5x average",    icon: DollarSign },
  "Creative Fatigue":  { color: "text-purple-400",       border: "border-purple-500/20", desc: "Frequency > 5",         icon: AlertTriangle },
  "Learning Limited":  { color: "text-slate-400",        border: "border-slate-500/20",  desc: "Low impressions & spend", icon: Target },
  "Audience Saturation": { color: "text-amber-400",      border: "border-amber-500/20",  desc: "High freq + high spend", icon: TrendingDown },
};

function NoAccountState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-secondary" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Select an Ad Account</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Choose an ad account from the dropdown above to run the AI analysis engine.
        </p>
      </div>
    </div>
  );
}

export default function AIInsights() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const fmt = useFormatCurrency();
  const currency = useAccountCurrency();
  const { data, isLoading } = useCampaigns(selectedAccountId, since, until);
  const { data: insightsData } = useInsights(selectedAccountId, since, until);

  if (!selectedAccountId) return <NoAccountState />;

  const rawCampaigns: any[] = data?.data ?? [];
  const campaigns: EnrichedCampaign[] = rawCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
    insight: extractInsight(c),
  }));

  const segments = segmentCampaigns(campaigns);
  const recommendations = generateRecommendations(campaigns, segments, fmt, currency);

  // Account-level KPIs for context header
  const acctInsight = insightsData?.data?.[0];
  const totalSpend = campaigns.reduce((s, c) => s + c.insight.spend, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.insight.revenue, 0);
  const accountRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgFreq = campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.insight.frequency, 0) / campaigns.length : 0;
  const avgCtr = campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.insight.ctr, 0) / campaigns.length : 0;
  const totalPurchases = campaigns.reduce((s, c) => s + c.insight.purchases, 0);
  const avgCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="h-8 w-8 text-secondary" />
          AI Intelligence Center
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Algorithmic segmentation and automated optimization recommendations powered by live {currency} data.
        </p>
      </div>

      {/* Account-level context */}
      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Total Spend", value: fmt(totalSpend) },
            { label: "Revenue", value: accountRoas > 0 ? fmt(totalRevenue) : "—" },
            { label: "Acct ROAS", value: accountRoas > 0 ? `${accountRoas.toFixed(2)}x` : "—" },
            { label: "Avg CTR", value: avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—" },
            { label: "Avg Freq", value: avgFreq > 0 ? avgFreq.toFixed(2) : "—" },
            { label: "Avg CPA", value: avgCpa > 0 ? fmt(avgCpa) : "—" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card/40 border border-card-border rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
              <div className="text-sm font-bold font-mono mt-0.5">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Segmentation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Campaign Segmentation Engine</h3>
          {!isLoading && (
            <Badge variant="outline" className="font-mono text-xs border-border">
              {campaigns.length} campaigns analyzed
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <Card key={i} className="bg-card/40 border-card-border">
                  <CardHeader className="pb-2"><Skeleton className="h-3 w-20" /></CardHeader>
                  <CardContent><Skeleton className="h-8 w-10" /></CardContent>
                </Card>
              ))
            : Object.entries(SEGMENT_META).map(([title, meta], i) => {
                const count = (segments[title] ?? []).length;
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className={`bg-card/40 border-card-border ${count > 0 ? meta.border : ""} hover:${meta.border} transition-colors`}>
                      <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          <Icon className={`h-3 w-3 ${count > 0 ? meta.color : "text-muted-foreground"}`} />
                          {title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className={`text-3xl font-bold ${count > 0 ? meta.color : "text-muted-foreground"}`}>{count}</div>
                        <p className="text-[9px] text-muted-foreground mt-1 leading-tight">{meta.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">AI Recommendations</h3>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-card/40 border-card-border h-52">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/6" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {recommendations.map((rec, i) => {
              const Icon = rec.icon;
              const priorityColor = {
                Critical: "bg-destructive",
                High: "bg-primary",
                Medium: "bg-secondary",
                Low: "bg-muted-foreground",
              }[rec.priority];
              const iconColor = {
                Critical: "text-destructive",
                High: "text-primary",
                Medium: "text-secondary",
                Low: "text-muted-foreground",
              }[rec.priority];
              const actionBg = {
                Critical: "bg-destructive/10 border-destructive/20",
                High: "bg-primary/10 border-primary/20",
                Medium: "bg-muted/30 border-border",
                Low: "bg-muted/20 border-border",
              }[rec.priority];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Card className="bg-card/40 border-card-border h-full relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${priorityColor}`} />
                    <CardHeader className="pb-3 pl-6">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                          <CardTitle className="text-sm font-semibold leading-tight">{rec.title}</CardTitle>
                        </div>
                        <Badge className={`${
                          rec.priority === "Critical" ? "bg-destructive text-destructive-foreground"
                          : rec.priority === "High" ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                        } text-[10px] shrink-0`}>
                          {rec.priority}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pl-6">
                      <p className="text-xs text-muted-foreground">{rec.description}</p>
                      <ul className="text-xs space-y-1 list-disc pl-4 text-card-foreground">
                        {rec.evidence.map((e, j) => <li key={j}>{e}</li>)}
                      </ul>
                      <div className={`p-3 rounded-md border mt-2 ${actionBg}`}>
                        <div className={`text-[10px] font-bold mb-1 uppercase tracking-wide ${iconColor}`}>
                          Recommended Action
                        </div>
                        <p className="text-xs text-card-foreground leading-relaxed">{rec.action}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
