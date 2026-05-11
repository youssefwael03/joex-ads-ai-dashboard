import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useCampaigns } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp, TrendingDown, Target, BrainCircuit, LayoutDashboard } from "lucide-react";
import { safeNum, getPurchaseRoas } from "@/lib/metaApi";

interface CampaignInsight {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  frequency: number;
  cpm: number;
  impressions: number;
  clicks: number;
  purchases: number;
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
  const purchases = (d.actions ?? []).find(
    (a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase"
  );
  return {
    spend: safeNum(d.spend),
    roas: getPurchaseRoas(d.purchase_roas),
    ctr: safeNum(d.ctr),
    cpc: safeNum(d.cpc),
    frequency: safeNum(d.frequency),
    cpm: safeNum(d.cpm),
    impressions: safeNum(d.impressions),
    clicks: safeNum(d.clicks),
    purchases: safeNum(purchases?.value),
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

  const avgSpend =
    campaigns.reduce((s, c) => s + c.insight.spend, 0) / Math.max(campaigns.length, 1);
  const avgCpa =
    campaigns
      .filter((c) => c.insight.purchases > 0)
      .reduce((s, c) => s + c.insight.spend / c.insight.purchases, 0) /
    Math.max(campaigns.filter((c) => c.insight.purchases > 0).length, 1);

  for (const c of campaigns) {
    const { roas, ctr, frequency, spend, purchases } = c.insight;
    const cpa = purchases > 0 ? spend / purchases : 0;

    if (roas >= 3 && ctr >= 2) {
      segments["Winners"].push(c);
    } else if (roas >= 2.5 && frequency < 3) {
      segments["Scaling Opps"].push(c);
    } else if (frequency > 5) {
      segments["Creative Fatigue"].push(c);
      segments["Fatigued"].push(c);
    } else if (frequency > 4) {
      segments["Fatigued"].push(c);
    } else if (frequency > 3.5 && spend > avgSpend * 1.5) {
      segments["Audience Saturation"].push(c);
    } else if (spend > avgSpend && roas < 1) {
      segments["High Risk"].push(c);
    } else if (ctr < 0.5) {
      segments["Low CTR"].push(c);
    } else if (avgCpa > 0 && cpa > avgCpa * 3 && purchases > 0) {
      segments["Expensive CPA"].push(c);
    } else if (c.insight.impressions < 1000 && spend < avgSpend * 0.2) {
      segments["Learning Limited"].push(c);
    } else if (roas >= 1.5) {
      segments["Stable Performers"].push(c);
    }
  }

  return segments;
}

function generateRecommendations(campaigns: EnrichedCampaign[], segments: Record<string, EnrichedCampaign[]>) {
  const recs: { priority: "Critical" | "High" | "Medium" | "Low"; title: string; description: string; evidence: string[]; action: string; icon: typeof AlertTriangle }[] = [];

  const fatigued = segments["Fatigued"] ?? [];
  if (fatigued.length > 0) {
    const worst = fatigued.sort((a, b) => b.insight.frequency - a.insight.frequency)[0];
    recs.push({
      priority: "Critical",
      title: "Creative Fatigue Detected",
      description: `${fatigued.length} campaign(s) are showing signs of audience fatigue.`,
      evidence: [
        `"${worst.name}" has frequency ${worst.insight.frequency.toFixed(1)}`,
        `CTR is ${worst.insight.ctr.toFixed(2)}% — below optimal threshold`,
        `CPM is $${worst.insight.cpm.toFixed(2)} — elevated from high frequency`,
      ],
      action: "Refresh creative assets, duplicate winning ad sets with new creatives, and exclude 14-day engagers from targeting.",
      icon: AlertTriangle,
    });
  }

  const winners = segments["Winners"] ?? [];
  if (winners.length > 0) {
    const best = winners.sort((a, b) => b.insight.roas - a.insight.roas)[0];
    recs.push({
      priority: "High",
      title: `Scale Winner: ${best.name.slice(0, 40)}`,
      description: "This campaign is significantly outperforming account averages.",
      evidence: [
        `ROAS is ${best.insight.roas.toFixed(2)}x — well above target`,
        `CTR is ${best.insight.ctr.toFixed(2)}% — strong audience resonance`,
        `Frequency is only ${best.insight.frequency.toFixed(1)} — room to scale`,
      ],
      action: "Increase daily budget by 20% every 48 hours. Duplicate the top-performing ad set to test new audiences.",
      icon: TrendingUp,
    });
  }

  const highRisk = segments["High Risk"] ?? [];
  if (highRisk.length > 0) {
    const worst = highRisk.sort((a, b) => b.insight.spend - a.insight.spend)[0];
    recs.push({
      priority: "Critical",
      title: "Wasted Spend Detected",
      description: `${highRisk.length} high-spend campaign(s) delivering ROAS < 1.`,
      evidence: [
        `"${worst.name}" spent $${worst.insight.spend.toFixed(0)} with ROAS ${worst.insight.roas.toFixed(2)}x`,
        `Every dollar spent is generating less than $1 in return`,
        `Immediate budget reallocation recommended`,
      ],
      action: "Pause underperforming campaigns immediately. Reallocate budget to winners. Review targeting and creative strategy.",
      icon: TrendingDown,
    });
  }

  const lowCtr = segments["Low CTR"] ?? [];
  if (lowCtr.length > 0) {
    recs.push({
      priority: "Medium",
      title: `Low CTR — ${lowCtr.length} Campaign(s)`,
      description: "Campaigns with CTR below 0.5% are wasting impressions without generating clicks.",
      evidence: [
        `${lowCtr.length} campaigns averaging ${(lowCtr.reduce((s, c) => s + c.insight.ctr, 0) / lowCtr.length).toFixed(2)}% CTR`,
        "Poor click-through indicates weak creative or audience mismatch",
        "High CPM relative to clicks suggests inventory waste",
      ],
      action: "Test new ad formats, stronger hooks, and refine targeting. Consider broadening audience or switching to Advantage+ targeting.",
      icon: Target,
    });
  }

  const scalingOpps = segments["Scaling Opps"] ?? [];
  if (scalingOpps.length > 0) {
    recs.push({
      priority: "High",
      title: `${scalingOpps.length} Scaling Opportunities Found`,
      description: "Campaigns with healthy ROAS and low frequency have untapped audience potential.",
      evidence: [
        `Avg ROAS: ${(scalingOpps.reduce((s, c) => s + c.insight.roas, 0) / scalingOpps.length).toFixed(2)}x`,
        `Avg frequency: ${(scalingOpps.reduce((s, c) => s + c.insight.frequency, 0) / scalingOpps.length).toFixed(1)} — audience not yet saturated`,
        "Budget increases should yield proportional returns",
      ],
      action: "Gradually increase budgets 15-25% every 48-72 hours. Monitor frequency and CPA closely as you scale.",
      icon: TrendingUp,
    });
  }

  if (recs.length === 0) {
    recs.push({
      priority: "Low",
      title: "All Campaigns Within Normal Range",
      description: "No critical issues detected. Continue monitoring for changes.",
      evidence: [
        `${campaigns.length} campaign(s) analyzed`,
        "No severe fatigue, wasted spend, or scaling bottlenecks detected",
      ],
      action: "Maintain current strategy. Review weekly for performance changes.",
      icon: Target,
    });
  }

  return recs;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-destructive text-destructive-foreground",
  High: "bg-primary text-primary-foreground",
  Medium: "bg-secondary text-secondary-foreground",
  Low: "bg-muted text-muted-foreground",
};

const SEGMENT_META: Record<string, { color: string; border: string; desc: string }> = {
  Winners: { color: "text-green-400", border: "border-green-500/20", desc: "ROAS ≥ 3, CTR ≥ 2%" },
  "Scaling Opps": { color: "text-primary", border: "border-primary/20", desc: "ROAS ≥ 2.5, Freq < 3" },
  "Stable Performers": { color: "text-blue-400", border: "border-blue-500/20", desc: "ROAS 1.5–3, healthy" },
  Fatigued: { color: "text-yellow-400", border: "border-yellow-500/20", desc: "Frequency > 4" },
  "High Risk": { color: "text-destructive", border: "border-destructive/20", desc: "High spend, ROAS < 1" },
  "Low CTR": { color: "text-orange-400", border: "border-orange-500/20", desc: "CTR < 0.5%" },
  "Expensive CPA": { color: "text-pink-400", border: "border-pink-500/20", desc: "CPA > 3x average" },
  "Creative Fatigue": { color: "text-purple-400", border: "border-purple-500/20", desc: "Frequency > 5" },
  "Learning Limited": { color: "text-slate-400", border: "border-slate-500/20", desc: "Low impressions & spend" },
  "Audience Saturation": { color: "text-amber-400", border: "border-amber-500/20", desc: "High freq + high spend" },
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
  const { data, isLoading } = useCampaigns(selectedAccountId, since, until);

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
  const recommendations = generateRecommendations(campaigns, segments);

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="h-8 w-8 text-secondary" />
          AI Intelligence Center
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Algorithmic segmentation and automated optimization recommendations based on live data.
        </p>
      </div>

      {/* Campaign Segmentation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Campaign Segmentation Engine</h3>
          <Badge variant="outline" className="font-mono text-xs border-border">
            {campaigns.length} campaigns analyzed
          </Badge>
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
                return (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className={`bg-card/40 border-card-border hover:${meta.border} transition-colors`}>
                      <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className={`text-3xl font-bold ${meta.color}`}>{count}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{meta.desc}</p>
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
              <Card key={i} className="bg-card/40 border-card-border h-48">
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
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
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="bg-card/40 border-card-border h-full relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${priorityColor}`} />
                    <CardHeader className="pb-3 pl-6">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                          <CardTitle className="text-sm font-semibold leading-tight">{rec.title}</CardTitle>
                        </div>
                        <Badge className={`${PRIORITY_COLORS[rec.priority]} text-[10px] shrink-0`}>
                          {rec.priority}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pl-6">
                      <p className="text-xs text-muted-foreground">{rec.description}</p>
                      <ul className="text-xs space-y-1.5 list-disc pl-4 text-card-foreground">
                        {rec.evidence.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                      <div className={`p-3 rounded-md border mt-3 ${
                        rec.priority === "Critical"
                          ? "bg-destructive/10 border-destructive/20"
                          : rec.priority === "High"
                          ? "bg-primary/10 border-primary/20"
                          : "bg-muted/30 border-border"
                      }`}>
                        <div className={`text-xs font-semibold mb-1 ${iconColor}`}>Recommended Action:</div>
                        <p className="text-xs text-card-foreground">{rec.action}</p>
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
