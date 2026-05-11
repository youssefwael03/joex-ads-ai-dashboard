import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BellRing, CheckCircle2, AlertTriangle, TrendingDown, Zap, LayoutDashboard, Info } from "lucide-react";
import { safeNum, getPurchaseRoas } from "@/lib/metaApi";
import { motion } from "framer-motion";

interface AlertItem {
  severity: "Critical" | "Warning" | "OK" | "Info";
  rule: string;
  value: string;
  detail: string;
  market?: string;
}

function getMarketBenchmarks(currency: string) {
  const isEGP = currency === "EGP";
  const isAED = currency === "AED";
  const isSAR = currency === "SAR";

  if (isEGP) {
    return {
      label: "Egyptian Market",
      roasMinProfit: 2.5,
      roasCritical: 1.2,
      cpmHigh: 30,
      cpmCritical: 60,
      cpcHigh: 3,
      cpcCritical: 8,
      ctrLow: 0.8,
      ctrCritical: 0.4,
      freqWarn: 3.5,
      freqCritical: 5,
      codRoasMin: 2.5,
      notes: "Egyptian e-commerce benchmarks (COD market, mobile-first, Arabic creatives)",
    };
  }
  if (isAED) {
    return {
      label: "UAE Market",
      roasMinProfit: 2.0,
      roasCritical: 0.8,
      cpmHigh: 25,
      cpmCritical: 50,
      cpcHigh: 5,
      cpcCritical: 15,
      ctrLow: 0.6,
      ctrCritical: 0.3,
      freqWarn: 4,
      freqCritical: 5.5,
      codRoasMin: 2.0,
      notes: "UAE market benchmarks (high CPM, premium audience, mixed Arabic/English)",
    };
  }
  if (isSAR) {
    return {
      label: "Saudi Market",
      roasMinProfit: 2.0,
      roasCritical: 0.8,
      cpmHigh: 20,
      cpmCritical: 45,
      cpcHigh: 4,
      cpcCritical: 12,
      ctrLow: 0.6,
      ctrCritical: 0.3,
      freqWarn: 4,
      freqCritical: 5.5,
      codRoasMin: 2.2,
      notes: "Saudi market benchmarks (strong mobile commerce, Arabic content essential)",
    };
  }
  return {
    label: "Global",
    roasMinProfit: 1.5,
    roasCritical: 0.5,
    cpmHigh: 20,
    cpmCritical: 40,
    cpcHigh: 3,
    cpcCritical: 8,
    ctrLow: 0.5,
    ctrCritical: 0.3,
    freqWarn: 4,
    freqCritical: 5.5,
    codRoasMin: 1.5,
    notes: "Global performance benchmarks",
  };
}

function buildAlerts(insights: any, campaigns: any[], currency: string): AlertItem[] {
  const alerts: AlertItem[] = [];
  const d = insights ?? {};
  const bm = getMarketBenchmarks(currency);

  const roas = getPurchaseRoas(d.purchase_roas);
  const freq = safeNum(d.frequency);
  const ctr = safeNum(d.ctr);
  const cpm = safeNum(d.cpm);
  const cpc = safeNum(d.cpc);
  const spend = safeNum(d.spend);

  // ── ROAS alert (market-adjusted) ──
  alerts.push({
    severity: roas > 0 && roas < bm.roasCritical ? "Critical" : roas > 0 && roas < bm.roasMinProfit ? "Warning" : roas === 0 ? "Info" : "OK",
    rule: `ROAS Monitor (min profitable: ${bm.roasMinProfit}x)`,
    value: roas > 0 ? `${roas.toFixed(2)}x` : "No data",
    detail: roas < bm.roasCritical && roas > 0
      ? `ROAS ${roas.toFixed(2)}x is critically below ${bm.label} breakeven. Immediate intervention needed.`
      : roas < bm.roasMinProfit && roas > 0
      ? `ROAS ${roas.toFixed(2)}x is below the ${bm.label} profitability threshold of ${bm.roasMinProfit}x.`
      : roas === 0 ? "No purchase conversions tracked — verify pixel events."
      : `ROAS is healthy for ${bm.label}.`,
    market: bm.label,
  });

  // ── Frequency / Creative Fatigue ──
  alerts.push({
    severity: freq > bm.freqCritical ? "Critical" : freq > bm.freqWarn ? "Warning" : "OK",
    rule: `Creative Fatigue (warn: ${bm.freqWarn}, critical: ${bm.freqCritical})`,
    value: freq > 0 ? freq.toFixed(2) : "—",
    detail: freq > bm.freqCritical
      ? `Frequency ${freq.toFixed(2)} is critically high — audience is over-saturated. Urgent creative refresh needed.`
      : freq > bm.freqWarn
      ? `Frequency ${freq.toFixed(2)} is elevated. Start testing new creatives to prevent fatigue.`
      : "Frequency is within safe range.",
    market: bm.label,
  });

  // ── CTR Alert (market-adjusted — Arabic/mobile-first markets have different baselines) ──
  alerts.push({
    severity: ctr > 0 && ctr < bm.ctrCritical ? "Critical" : ctr > 0 && ctr < bm.ctrLow ? "Warning" : ctr === 0 ? "Info" : "OK",
    rule: `CTR Monitor (${bm.label} baseline: ${bm.ctrLow}%)`,
    value: ctr > 0 ? `${ctr.toFixed(2)}%` : "—",
    detail: ctr < bm.ctrCritical && ctr > 0
      ? `CTR ${ctr.toFixed(2)}% is critically low. Creative hooks are not resonating with the audience.`
      : ctr < bm.ctrLow && ctr > 0
      ? `CTR ${ctr.toFixed(2)}% is below the ${bm.label} benchmark of ${bm.ctrLow}%. Review ad copy and creative.`
      : ctr === 0 ? "No click data available."
      : "CTR is performing well.",
    market: bm.label,
  });

  // ── CPM alert ──
  alerts.push({
    severity: cpm > bm.cpmCritical ? "Critical" : cpm > bm.cpmHigh ? "Warning" : cpm > 0 ? "OK" : "Info",
    rule: `CPM Monitor (${currency} — high: ${bm.cpmHigh}, critical: ${bm.cpmCritical})`,
    value: cpm > 0 ? `${currency} ${cpm.toFixed(2)}` : "—",
    detail: cpm > bm.cpmCritical
      ? `CPM ${currency} ${cpm.toFixed(2)} is very high. Audience may be too narrow or competition is intense.`
      : cpm > bm.cpmHigh
      ? `CPM ${currency} ${cpm.toFixed(2)} is above the ${bm.label} benchmark. Consider broadening targeting.`
      : cpm > 0 ? `CPM is within acceptable range for ${bm.label}.`
      : "No CPM data.",
    market: bm.label,
  });

  // ── Wasted Spend (campaigns with ROAS < 1) ──
  const wastedCampaigns = campaigns.filter((c: any) => {
    const ci = c.insights?.data?.[0] ?? {};
    const r = getPurchaseRoas(ci.purchase_roas);
    const s = safeNum(ci.spend);
    return s > 0 && r > 0 && r < 1;
  });
  alerts.push({
    severity: wastedCampaigns.length > 2 ? "Critical" : wastedCampaigns.length > 0 ? "Warning" : "OK",
    rule: "Wasted Spend Detection",
    value: `${wastedCampaigns.length} campaign(s)`,
    detail: wastedCampaigns.length > 0
      ? `${wastedCampaigns.length} campaign(s) spending with ROAS < 1x (losing money): ${wastedCampaigns.slice(0, 2).map((c: any) => c.name?.slice(0, 30)).join(", ")}${wastedCampaigns.length > 2 ? "..." : ""}`
      : "No campaigns with ROAS below 1x detected.",
  });

  // ── COD Economics (EGP/AED/SAR specific) ──
  if (currency === "EGP" || currency === "AED" || currency === "SAR") {
    const codRisk = campaigns.filter((c: any) => {
      const ci = c.insights?.data?.[0] ?? {};
      const r = getPurchaseRoas(ci.purchase_roas);
      const s = safeNum(ci.spend);
      return s > 0 && r > 0 && r < bm.codRoasMin;
    });
    alerts.push({
      severity: codRisk.length > 0 ? "Warning" : "OK",
      rule: `COD Profitability Check (${bm.label} min ROAS: ${bm.codRoasMin}x)`,
      value: `${codRisk.length} at-risk`,
      detail: codRisk.length > 0
        ? `${codRisk.length} campaign(s) below COD breakeven ROAS of ${bm.codRoasMin}x. With typical COD cancellation rates (30–40%), these may not be profitable.`
        : `All campaigns meet the ${bm.label} COD profitability threshold.`,
      market: bm.label,
    });
  }

  // ── Budget Concentration Risk ──
  if (campaigns.length > 1 && spend > 0) {
    const maxSpend = Math.max(...campaigns.map((c: any) => safeNum(c.insights?.data?.[0]?.spend)));
    const concentration = maxSpend / spend;
    alerts.push({
      severity: concentration > 0.8 ? "Warning" : "OK",
      rule: "Budget Concentration Risk",
      value: `${(concentration * 100).toFixed(0)}% in top campaign`,
      detail: concentration > 0.8
        ? `${(concentration * 100).toFixed(0)}% of spend is in a single campaign. High concentration risk — diversify budget allocation.`
        : "Budget is reasonably distributed across campaigns.",
    });
  }

  // ── High-frequency campaigns ──
  const fatiguedCount = campaigns.filter((c: any) => safeNum(c.insights?.data?.[0]?.frequency) > bm.freqWarn).length;
  alerts.push({
    severity: fatiguedCount >= 3 ? "Critical" : fatiguedCount > 0 ? "Warning" : "OK",
    rule: "Campaign-Level Fatigue Scan",
    value: `${fatiguedCount} campaign(s)`,
    detail: fatiguedCount > 0
      ? `${fatiguedCount} campaign(s) have frequency above ${bm.freqWarn} — plan creative refresh cycles.`
      : "No campaign-level fatigue detected.",
  });

  return alerts.sort((a, b) => {
    const order = { Critical: 0, Warning: 1, Info: 2, OK: 3 };
    return order[a.severity] - order[b.severity];
  });
}

const SEVERITY_STYLES = {
  Critical: {
    badge: "border-destructive/50 bg-destructive/10 text-destructive",
    border: "border-l-destructive",
    icon: AlertTriangle,
    iconColor: "text-destructive",
  },
  Warning: {
    badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400",
    border: "border-l-yellow-500",
    icon: TrendingDown,
    iconColor: "text-yellow-400",
  },
  Info: {
    badge: "border-blue-500/50 bg-blue-500/10 text-blue-400",
    border: "border-l-blue-500",
    icon: Info,
    iconColor: "text-blue-400",
  },
  OK: {
    badge: "border-green-500/50 bg-green-500/10 text-green-400",
    border: "border-l-green-500",
    icon: CheckCircle2,
    iconColor: "text-green-400",
  },
};

export default function Alerts() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const currency = useAccountCurrency();
  const fmt = useFormatCurrency();
  const { data: insightsData, isLoading: insightsLoading } = useInsights(selectedAccountId, since, until);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(selectedAccountId, since, until);

  if (!selectedAccountId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <LayoutDashboard className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Choose an account above to see live alerts.</p>
        </div>
      </div>
    );
  }

  const isLoading = insightsLoading || campaignsLoading;
  const insights = insightsData?.data?.[0] ?? null;
  const campaigns: any[] = campaignsData?.data ?? [];
  const bm = getMarketBenchmarks(currency);
  const alerts = isLoading ? [] : buildAlerts(insights, campaigns, currency);

  const criticalCount = alerts.filter((a) => a.severity === "Critical").length;
  const warningCount = alerts.filter((a) => a.severity === "Warning").length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BellRing className="h-8 w-8" />
            Automation & Alerts
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Live performance monitors calibrated for <span className="text-foreground font-medium">{bm.label}</span> — {bm.notes}.
          </p>
        </div>
        {!isLoading && (
          <div className="flex gap-2 flex-wrap">
            {criticalCount > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/30">{criticalCount} Critical</Badge>}
            {warningCount > 0 && <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">{warningCount} Warning</Badge>}
            {criticalCount === 0 && warningCount === 0 && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />All Clear
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-xs">{currency}</Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <Card key={i} className="bg-card/40 border-card-border border-l-4 border-l-border">
                <CardContent className="p-5 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))
          : alerts.map((alert, i) => {
              const styles = SEVERITY_STYLES[alert.severity];
              const Icon = styles.icon;
              return (
                <motion.div
                  key={alert.rule}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={`bg-card/40 border-card-border border-l-4 ${styles.border} transition-all`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${styles.iconColor}`} />
                          <div>
                            <div className="font-medium text-sm text-foreground">{alert.rule}</div>
                            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{alert.detail}</div>
                            {alert.market && alert.market !== "Global" && (
                              <Badge variant="outline" className="text-[9px] mt-1.5 border-border">{alert.market}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono font-bold text-sm text-foreground">{alert.value}</div>
                          <Badge variant="outline" className={`text-[10px] mt-1 ${styles.badge}`}>
                            {alert.severity}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
      </div>

      <Card className="bg-card/40 border-card-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Active Monitor Rules — {bm.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              `ROAS < ${bm.roasMinProfit}x — Profitability threshold`,
              `ROAS < ${bm.roasCritical}x — Critical loss alert`,
              `CTR < ${bm.ctrLow}% — Low engagement`,
              `CTR < ${bm.ctrCritical}% — Critical engagement`,
              `CPM > ${currency} ${bm.cpmHigh} — High auction cost`,
              `CPM > ${currency} ${bm.cpmCritical} — Critical CPM`,
              `Frequency > ${bm.freqWarn} — Fatigue warning`,
              `Frequency > ${bm.freqCritical} — Critical fatigue`,
              "ROAS < 1x any campaign — Wasted spend",
              ...(currency !== "USD" ? [`COD ROAS < ${bm.codRoasMin}x — COD economics`] : []),
              "Budget concentration > 80% — Single campaign risk",
            ].map((rule) => (
              <div key={rule} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {rule}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
