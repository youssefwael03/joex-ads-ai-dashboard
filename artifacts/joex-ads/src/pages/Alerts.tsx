import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns, useAccountInfo, useInsightsDaily } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BellRing, CheckCircle2, AlertTriangle, TrendingDown, Zap, LayoutDashboard,
  Info, Wallet, Target, Activity, BarChart2, TrendingUp, Clock, DollarSign,
} from "lucide-react";
import { safeNum, getPurchaseRoas, getAction, fmtCurrency } from "@/lib/metaApi";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, Cell,
} from "recharts";

// ── Market benchmarks ─────────────────────────────────────────────────────────

function getMarketBenchmarks(currency: string) {
  if (currency === "EGP") return {
    label: "Egyptian Market", roasMinProfit: 2.5, roasCritical: 1.2,
    cpmHigh: 30, cpmCritical: 60, cpcHigh: 3, cpcCritical: 8,
    ctrLow: 0.8, ctrCritical: 0.4, freqWarn: 3.5, freqCritical: 5,
    codRoasMin: 2.5, notes: "Egyptian e-commerce benchmarks (COD market, mobile-first)",
  };
  if (currency === "AED") return {
    label: "UAE Market", roasMinProfit: 2.0, roasCritical: 0.8,
    cpmHigh: 25, cpmCritical: 50, cpcHigh: 5, cpcCritical: 15,
    ctrLow: 0.6, ctrCritical: 0.3, freqWarn: 4, freqCritical: 5.5,
    codRoasMin: 2.0, notes: "UAE market benchmarks (premium audience, mixed Arabic/English)",
  };
  if (currency === "SAR") return {
    label: "Saudi Market", roasMinProfit: 2.0, roasCritical: 0.8,
    cpmHigh: 20, cpmCritical: 45, cpcHigh: 4, cpcCritical: 12,
    ctrLow: 0.6, ctrCritical: 0.3, freqWarn: 4, freqCritical: 5.5,
    codRoasMin: 2.2, notes: "Saudi market benchmarks (Arabic content essential)",
  };
  return {
    label: "Global", roasMinProfit: 1.5, roasCritical: 0.5,
    cpmHigh: 20, cpmCritical: 40, cpcHigh: 3, cpcCritical: 8,
    ctrLow: 0.5, ctrCritical: 0.3, freqWarn: 4, freqCritical: 5.5,
    codRoasMin: 1.5, notes: "Global performance benchmarks",
  };
}

// ── Alert builder (active campaigns only) ────────────────────────────────────

function buildAlerts(insights: any, activeCampaigns: any[], currency: string) {
  const alerts: { severity: "Critical" | "Warning" | "OK" | "Info"; rule: string; value: string; detail: string; market?: string }[] = [];
  const d = insights ?? {};
  const bm = getMarketBenchmarks(currency);
  const roas = getPurchaseRoas(d.purchase_roas);
  const freq = safeNum(d.frequency);
  const ctr = safeNum(d.ctr);
  const cpm = safeNum(d.cpm);
  const spend = safeNum(d.spend);

  alerts.push({
    severity: roas > 0 && roas < bm.roasCritical ? "Critical" : roas > 0 && roas < bm.roasMinProfit ? "Warning" : roas === 0 ? "Info" : "OK",
    rule: `ROAS Monitor (min: ${bm.roasMinProfit}x)`,
    value: roas > 0 ? `${roas.toFixed(2)}x` : "No data",
    detail: roas < bm.roasCritical && roas > 0 ? `ROAS ${roas.toFixed(2)}x is critically below breakeven. Immediate action needed.`
      : roas < bm.roasMinProfit && roas > 0 ? `ROAS ${roas.toFixed(2)}x is below the ${bm.label} profitability threshold of ${bm.roasMinProfit}x.`
      : roas === 0 ? "No purchase conversions tracked — verify pixel events."
      : `ROAS is healthy for ${bm.label}.`,
    market: bm.label,
  });

  alerts.push({
    severity: freq > bm.freqCritical ? "Critical" : freq > bm.freqWarn ? "Warning" : "OK",
    rule: `Creative Fatigue (warn: ${bm.freqWarn})`,
    value: freq > 0 ? freq.toFixed(2) : "—",
    detail: freq > bm.freqCritical ? `Frequency ${freq.toFixed(2)} is critically high — audience over-saturated. Urgent creative refresh needed.`
      : freq > bm.freqWarn ? `Frequency ${freq.toFixed(2)} elevated. Start testing new creatives now.`
      : "Frequency is within safe range.",
    market: bm.label,
  });

  alerts.push({
    severity: ctr > 0 && ctr < bm.ctrCritical ? "Critical" : ctr > 0 && ctr < bm.ctrLow ? "Warning" : ctr === 0 ? "Info" : "OK",
    rule: `CTR Monitor (baseline: ${bm.ctrLow}%)`,
    value: ctr > 0 ? `${ctr.toFixed(2)}%` : "—",
    detail: ctr < bm.ctrCritical && ctr > 0 ? `CTR ${ctr.toFixed(2)}% is critically low. Creative hooks not resonating.`
      : ctr < bm.ctrLow && ctr > 0 ? `CTR ${ctr.toFixed(2)}% is below the ${bm.label} benchmark of ${bm.ctrLow}%.`
      : ctr === 0 ? "No click data available."
      : "CTR is performing well.",
    market: bm.label,
  });

  alerts.push({
    severity: cpm > bm.cpmCritical ? "Critical" : cpm > bm.cpmHigh ? "Warning" : cpm > 0 ? "OK" : "Info",
    rule: `CPM Monitor (high: ${bm.cpmHigh}, critical: ${bm.cpmCritical})`,
    value: cpm > 0 ? fmtCurrency(cpm, currency) : "—",
    detail: cpm > bm.cpmCritical ? `CPM ${fmtCurrency(cpm, currency)} is very high. Audience too narrow or competition intense.`
      : cpm > bm.cpmHigh ? `CPM ${fmtCurrency(cpm, currency)} is above benchmark. Consider broadening targeting.`
      : cpm > 0 ? `CPM is within acceptable range for ${bm.label}.` : "No CPM data.",
    market: bm.label,
  });

  const wastedCampaigns = activeCampaigns.filter((c: any) => {
    const ci = c.insights?.data?.[0] ?? {};
    const r = getPurchaseRoas(ci.purchase_roas);
    const s = safeNum(ci.spend);
    return s > 0 && r > 0 && r < 1;
  });
  alerts.push({
    severity: wastedCampaigns.length > 2 ? "Critical" : wastedCampaigns.length > 0 ? "Warning" : "OK",
    rule: "Wasted Spend (ROAS < 1x)",
    value: `${wastedCampaigns.length} active campaign(s)`,
    detail: wastedCampaigns.length > 0
      ? `${wastedCampaigns.length} active campaign(s) losing money: ${wastedCampaigns.slice(0, 2).map((c: any) => c.name?.slice(0, 25)).join(", ")}${wastedCampaigns.length > 2 ? "..." : ""}`
      : "No active campaigns with ROAS below 1x.",
  });

  if (currency === "EGP" || currency === "AED" || currency === "SAR") {
    const codRisk = activeCampaigns.filter((c: any) => {
      const ci = c.insights?.data?.[0] ?? {};
      const r = getPurchaseRoas(ci.purchase_roas);
      const s = safeNum(ci.spend);
      return s > 0 && r > 0 && r < bm.codRoasMin;
    });
    alerts.push({
      severity: codRisk.length > 0 ? "Warning" : "OK",
      rule: `COD Profitability (min: ${bm.codRoasMin}x)`,
      value: `${codRisk.length} at-risk`,
      detail: codRisk.length > 0
        ? `${codRisk.length} active campaign(s) below COD breakeven ROAS. With 30–40% cancellation rates, likely unprofitable.`
        : `All active campaigns meet the ${bm.label} COD profitability threshold.`,
      market: bm.label,
    });
  }

  if (activeCampaigns.length > 1 && spend > 0) {
    const maxSpend = Math.max(...activeCampaigns.map((c: any) => safeNum(c.insights?.data?.[0]?.spend)));
    const concentration = maxSpend / spend;
    alerts.push({
      severity: concentration > 0.8 ? "Warning" : "OK",
      rule: "Budget Concentration Risk",
      value: `${(concentration * 100).toFixed(0)}% in top campaign`,
      detail: concentration > 0.8
        ? `${(concentration * 100).toFixed(0)}% of spend is in a single campaign. Diversify to reduce risk.`
        : "Budget is reasonably distributed across active campaigns.",
    });
  }

  const fatiguedCount = activeCampaigns.filter((c: any) => safeNum(c.insights?.data?.[0]?.frequency) > bm.freqWarn).length;
  alerts.push({
    severity: fatiguedCount >= 3 ? "Critical" : fatiguedCount > 0 ? "Warning" : "OK",
    rule: "Campaign-Level Fatigue Scan",
    value: `${fatiguedCount} active campaign(s)`,
    detail: fatiguedCount > 0
      ? `${fatiguedCount} active campaign(s) have frequency above ${bm.freqWarn} — plan creative refresh.`
      : "No campaign-level fatigue detected.",
  });

  return alerts.sort((a, b) => {
    const order = { Critical: 0, Warning: 1, Info: 2, OK: 3 };
    return order[a.severity] - order[b.severity];
  });
}

// ── Balance resolver ──────────────────────────────────────────────────────────

function resolveBalance(info: any): number | null {
  if (info == null) return null;
  const fsdValue = safeNum(info?.funding_source_details?.value);
  if (fsdValue > 0) return fsdValue;
  const bal = safeNum(info?.balance);
  if (bal > 0) return bal / 100;
  return 0;
}

// ── Severity styles ────────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  Critical: { badge: "border-destructive/50 bg-destructive/10 text-destructive", border: "border-l-destructive", icon: AlertTriangle, iconColor: "text-destructive", dot: "bg-destructive" },
  Warning: { badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400", border: "border-l-yellow-500", icon: TrendingDown, iconColor: "text-yellow-400", dot: "bg-yellow-500" },
  Info: { badge: "border-blue-500/50 bg-blue-500/10 text-blue-400", border: "border-l-blue-500", icon: Info, iconColor: "text-blue-400", dot: "bg-blue-500" },
  OK: { badge: "border-green-500/50 bg-green-500/10 text-green-400", border: "border-l-green-500", icon: CheckCircle2, iconColor: "text-green-400", dot: "bg-green-500" },
};

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency, isRoas }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1 truncate max-w-[180px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-semibold text-foreground">
            {isRoas ? `${Number(p.value).toFixed(2)}x` : fmtCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Alerts() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const currency = useAccountCurrency();
  const fmt = useFormatCurrency();

  const { data: insightsData, isLoading: insightsLoading } = useInsights(selectedAccountId, since, until);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(selectedAccountId, since, until);
  const { data: accountInfoData, isLoading: accountInfoLoading } = useAccountInfo(selectedAccountId);

  if (!selectedAccountId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <LayoutDashboard className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Choose an account above to see live alerts and budget pacing.</p>
        </div>
      </div>
    );
  }

  const isLoading = insightsLoading || campaignsLoading;
  const insights = insightsData?.data?.[0] ?? null;
  const allCampaigns: any[] = campaignsData?.data ?? [];
  // Active campaigns only
  const activeCampaigns = allCampaigns.filter((c: any) => c.status === "ACTIVE");
  const bm = getMarketBenchmarks(currency);
  const alerts = isLoading ? [] : buildAlerts(insights, activeCampaigns, currency);

  const criticalCount = alerts.filter((a) => a.severity === "Critical").length;
  const warningCount = alerts.filter((a) => a.severity === "Warning").length;
  const okCount = alerts.filter((a) => a.severity === "OK").length;

  const accountInfo = accountInfoData as any;
  const balanceRaw = resolveBalance(accountInfo);
  const noFunds = balanceRaw !== null && balanceRaw <= 0;
  const totalSpend = safeNum(insights?.spend);
  const dateFrom = new Date(since);
  const dateTo = new Date(until);
  const periodDays = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
  const dailySpendAvg = periodDays > 0 ? totalSpend / periodDays : 0;
  const daysRemaining = !noFunds && balanceRaw != null && balanceRaw > 0 && dailySpendAvg > 0 ? balanceRaw / dailySpendAvg : null;
  const isEgpAccount = currency === "EGP";
  const balanceLowThreshold = isEgpAccount ? 2000 : 100;
  const balanceCriticalThreshold = isEgpAccount ? 500 : 20;

  // ── Budget pacing data ──────────────────────────────────────────────────────
  const pacingData = activeCampaigns
    .map((c: any) => {
      const ci = c.insights?.data?.[0] ?? {};
      const spend = safeNum(ci.spend);
      const dailyBudget = safeNum(c.daily_budget) / 100;
      const lifetimeBudget = safeNum(c.lifetime_budget) / 100;
      const periodBudget = dailyBudget > 0 ? dailyBudget * periodDays : lifetimeBudget;
      if (periodBudget <= 0) return null;
      const utilPct = Math.min((spend / periodBudget) * 100, 150);
      const status = utilPct < 50 ? "Underpacing" : utilPct > 110 ? "Overpacing" : "On Track";
      return {
        name: c.name?.length > 28 ? c.name.slice(0, 28) + "…" : c.name,
        fullName: c.name,
        spend,
        periodBudget,
        dailyBudget,
        utilPct,
        status,
        roas: getPurchaseRoas(ci.purchase_roas),
        ctr: safeNum(ci.ctr),
        frequency: safeNum(ci.frequency),
        purchases: getAction(ci.actions, "offsite_conversion.fb_pixel_purchase") || getAction(ci.actions, "purchase"),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.spend - a.spend) as any[];

  // ── Health score ────────────────────────────────────────────────────────────
  const totalAlerts = criticalCount + warningCount + okCount;
  const healthScore = totalAlerts > 0 ? Math.round(((okCount + warningCount * 0.5) / totalAlerts) * 100) : 100;
  const healthColor = healthScore >= 80 ? "#22c55e" : healthScore >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BellRing className="h-8 w-8" />
            Performance Monitor
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Live alerts & budget pacing calibrated for <span className="text-foreground font-medium">{bm.label}</span>.
            {activeCampaigns.length > 0 && (
              <span> Monitoring <span className="text-foreground font-medium">{activeCampaigns.length} active</span> campaign{activeCampaigns.length !== 1 ? "s" : ""}.</span>
            )}
          </p>
        </div>
        {!isLoading && (
          <div className="flex gap-2 flex-wrap">
            {criticalCount > 0 && <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1"><AlertTriangle className="h-3 w-3" />{criticalCount} Critical</Badge>}
            {warningCount > 0 && <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1"><TrendingDown className="h-3 w-3" />{warningCount} Warning</Badge>}
            {criticalCount === 0 && warningCount === 0 && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30 gap-1"><CheckCircle2 className="h-3 w-3" />All Clear</Badge>
            )}
            <Badge variant="outline" className="font-mono text-xs">{currency}</Badge>
          </div>
        )}
      </div>

      {/* ── Top KPI strip ── */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active Campaigns", value: activeCampaigns.length, icon: Activity, color: "text-primary" },
            { label: "Total Spend", value: fmt(totalSpend), icon: DollarSign, color: "text-foreground" },
            { label: "Avg Daily Spend", value: dailySpendAvg > 0 ? fmt(dailySpendAvg) : "—", icon: Clock, color: "text-foreground" },
            { label: "Account Health", value: `${healthScore}%`, icon: Target, color: healthScore >= 80 ? "text-green-400" : healthScore >= 50 ? "text-yellow-400" : "text-destructive" },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label} className="bg-card/40 border-card-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-card/80 border border-card-border flex items-center justify-center shrink-0">
                    <Icon className={`h-4 w-4 ${kpi.color}`} />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</div>
                    <div className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Balance + Health row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Balance card — 2 cols */}
        {!accountInfoLoading && balanceRaw !== null && (() => {
          const b = balanceRaw;
          const isCritical = noFunds || b < balanceCriticalThreshold || (daysRemaining !== null && daysRemaining < 1);
          const isWarning = !isCritical && (b < balanceLowThreshold || (daysRemaining !== null && daysRemaining < 2));
          const borderColor = isCritical ? "border-l-destructive bg-destructive/5" : isWarning ? "border-l-yellow-500 bg-yellow-500/5" : "border-l-green-500 bg-card/40";
          const iconColor = isCritical ? "text-destructive" : isWarning ? "text-yellow-400" : "text-green-400";
          const badgeLabel = isCritical ? "Critical" : isWarning ? "Warning" : "OK";
          const badgeClass = isCritical ? "border-destructive/50 bg-destructive/10 text-destructive" : isWarning ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" : "border-green-500/50 bg-green-500/10 text-green-400";
          const pct = daysRemaining != null ? Math.min((daysRemaining / 30) * 100, 100) : null;
          return (
            <Card className={`lg:col-span-2 border-l-4 ${borderColor} border-card-border`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Wallet className={`h-5 w-5 ${iconColor}`} />
                    <span className="font-semibold text-sm text-foreground">Account Balance & Forecast</span>
                  </div>
                  <Badge variant="outline" className={badgeClass}>{badgeLabel}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Balance</div>
                    <div className={`text-xl font-bold font-mono ${noFunds ? "text-destructive" : "text-foreground"}`}>{fmtCurrency(b, currency)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Daily Avg Spend</div>
                    <div className="text-xl font-bold font-mono text-foreground">{dailySpendAvg > 0 ? fmtCurrency(dailySpendAvg, currency) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Days Remaining</div>
                    <div className={`text-xl font-bold font-mono ${daysRemaining == null ? "text-muted-foreground" : daysRemaining < 2 ? "text-destructive" : daysRemaining < 5 ? "text-yellow-400" : "text-green-400"}`}>
                      {daysRemaining != null ? `${daysRemaining.toFixed(1)}d` : "—"}
                    </div>
                  </div>
                </div>
                {pct != null && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                      <span>Balance runway</span>
                      <span>{daysRemaining!.toFixed(1)} days at current pace</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-card/80 border border-card-border overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isCritical ? "bg-destructive" : isWarning ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {noFunds && <p className="text-destructive text-xs font-semibold mt-2">No funds — ads may be stopped. Top up immediately.</p>}
                    {!noFunds && isEgpAccount && b < balanceLowThreshold && <p className="text-yellow-400 text-xs font-medium mt-2">Balance below {fmtCurrency(balanceLowThreshold, currency)} — recommend topping up.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Health score radial */}
        {!isLoading && (
          <Card className="bg-card/40 border-card-border">
            <CardContent className="p-5 flex flex-col items-center justify-center h-full">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Account Health Score</div>
              <div className="h-28 w-28 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="100%" barSize={10} data={[{ value: healthScore, fill: healthColor }]} startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "rgba(255,255,255,0.05)" }}>
                      <Cell fill={healthColor} />
                    </RadialBar>
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold font-mono" style={{ color: healthColor }}>{healthScore}</span>
                </div>
              </div>
              <div className="mt-2 space-y-1 w-full">
                {[
                  { label: "Critical", count: criticalCount, color: "bg-destructive" },
                  { label: "Warning", count: warningCount, color: "bg-yellow-500" },
                  { label: "Passing", count: okCount, color: "bg-green-500" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${s.color}`} />
                      <span className="text-muted-foreground">{s.label}</span>
                    </div>
                    <span className="font-mono font-semibold text-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Budget Pacing ── */}
      {!isLoading && pacingData.length > 0 && (
        <Card className="bg-card/40 border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Budget Pacing — Active Campaigns
              <Badge variant="outline" className="text-[10px] ml-auto border-border">{periodDays}d period</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pacingData.map((c: any) => {
              const isOver = c.status === "Overpacing";
              const isUnder = c.status === "Underpacing";
              const barColor = isOver ? "bg-destructive" : isUnder ? "bg-blue-500" : "bg-green-500";
              const badgeClass = isOver
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : isUnder
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-green-500/40 bg-green-500/10 text-green-400";
              return (
                <div key={c.fullName} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
                      {c.roas > 0 && (
                        <span className={`text-[10px] font-mono font-semibold shrink-0 ${c.roas >= bm.roasMinProfit ? "text-green-400" : c.roas >= 1 ? "text-yellow-400" : "text-destructive"}`}>
                          {c.roas.toFixed(2)}x ROAS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground font-mono">{fmt(c.spend)} / {fmt(c.periodBudget)}</span>
                      <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>{c.status}</Badge>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-card/80 border border-card-border overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(c.utilPct, 100)}%` }}
                    />
                    {/* Expected pace marker at 100% */}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{c.utilPct.toFixed(0)}% of {periodDays}d budget used</span>
                    <span>{c.dailyBudget > 0 ? `${fmt(c.dailyBudget)}/day` : "Lifetime budget"}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Campaign health table ── */}
      {!isLoading && activeCampaigns.length > 0 && (
        <Card className="bg-card/40 border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Active Campaign Health
              <Badge variant="outline" className="text-[10px] ml-auto">{activeCampaigns.length} campaigns</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border">
                    {["Campaign", "Spend", "ROAS", "CTR", "CPM", "Freq", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium first:pl-5 last:pr-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCampaigns
                    .map((c: any) => {
                      const ci = c.insights?.data?.[0] ?? {};
                      return {
                        ...c,
                        spend: safeNum(ci.spend),
                        roas: getPurchaseRoas(ci.purchase_roas),
                        ctr: safeNum(ci.ctr),
                        cpm: safeNum(ci.cpm),
                        freq: safeNum(ci.frequency),
                      };
                    })
                    .sort((a: any, b: any) => b.spend - a.spend)
                    .map((c: any, i: number) => {
                      const roasOk = c.roas >= bm.roasMinProfit;
                      const roasWarn = c.roas > 0 && c.roas >= 1;
                      const freqBad = c.freq > bm.freqWarn;
                      const ctrBad = c.ctr > 0 && c.ctr < bm.ctrLow;
                      return (
                        <tr key={c.id} className={`border-b border-card-border/50 transition-colors hover:bg-card/60 ${i % 2 === 0 ? "" : "bg-card/20"}`}>
                          <td className="px-4 py-3 pl-5 font-medium text-foreground max-w-[200px]">
                            <div className="truncate">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground">{c.objective?.replace(/_/g, " ")}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground">{c.spend > 0 ? fmt(c.spend) : "—"}</td>
                          <td className="px-4 py-3 font-mono font-semibold">
                            {c.roas > 0 ? (
                              <span className={roasOk ? "text-green-400" : roasWarn ? "text-yellow-400" : "text-destructive"}>
                                {c.roas.toFixed(2)}x
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            <span className={ctrBad ? "text-yellow-400" : "text-foreground"}>{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : "—"}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground">{c.cpm > 0 ? fmt(c.cpm) : "—"}</td>
                          <td className="px-4 py-3 font-mono">
                            <span className={freqBad ? "text-destructive font-semibold" : "text-foreground"}>{c.freq > 0 ? c.freq.toFixed(1) : "—"}</span>
                          </td>
                          <td className="px-4 py-3 pr-5">
                            {c.roas === 0 ? (
                              <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">No ROAS</Badge>
                            ) : roasOk ? (
                              <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Healthy</Badge>
                            ) : roasWarn ? (
                              <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400">Monitor</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive">Critical</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Performance Alerts ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <BellRing className="h-3.5 w-3.5" /> Performance Alerts
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
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
                  <motion.div key={alert.rule} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card className={`bg-card/40 border-card-border border-l-4 ${styles.border}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${styles.iconColor}`} />
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-foreground">{alert.rule}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.detail}</div>
                              {alert.market && alert.market !== "Global" && (
                                <Badge variant="outline" className="text-[9px] mt-1.5 border-border">{alert.market}</Badge>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono font-bold text-sm text-foreground">{alert.value}</div>
                            <Badge variant="outline" className={`text-[10px] mt-1 ${styles.badge}`}>{alert.severity}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
        </div>
      </div>

      {/* ── Monitor rules reference ── */}
      <Card className="bg-card/40 border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Active Monitor Rules — {bm.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              `ROAS < ${bm.roasMinProfit}x — Profitability warning`,
              `ROAS < ${bm.roasCritical}x — Critical loss`,
              `CTR < ${bm.ctrLow}% — Low engagement`,
              `CTR < ${bm.ctrCritical}% — Critical engagement`,
              `CPM > ${bm.cpmHigh} ${currency} — High auction cost`,
              `CPM > ${bm.cpmCritical} ${currency} — Critical CPM`,
              `Frequency > ${bm.freqWarn} — Fatigue warning`,
              `Frequency > ${bm.freqCritical} — Critical fatigue`,
              "ROAS < 1x any campaign — Wasted spend",
              ...(currency !== "USD" ? [`COD ROAS < ${bm.codRoasMin}x — COD check`] : []),
              "Budget > 80% one campaign — Concentration risk",
              "Balance runway < 2 days — Low funds",
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
