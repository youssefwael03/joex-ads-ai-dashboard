import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BellRing, CheckCircle2, AlertTriangle, TrendingDown, Zap, LayoutDashboard } from "lucide-react";
import { safeNum, getPurchaseRoas } from "@/lib/metaApi";
import { motion } from "framer-motion";

interface AlertItem {
  severity: "Critical" | "Warning" | "OK";
  rule: string;
  value: string;
  detail: string;
}

function buildAlerts(insights: any, campaigns: any[]): AlertItem[] {
  const alerts: AlertItem[] = [];
  const d = insights ?? {};

  const roas = getPurchaseRoas(d.purchase_roas);
  const freq = safeNum(d.frequency);
  const ctr = safeNum(d.ctr);
  const spend = safeNum(d.spend);

  alerts.push({
    severity: roas < 1.5 ? (roas < 0.5 ? "Critical" : "Warning") : "OK",
    rule: "ROAS Drop Alert (threshold: 1.5x)",
    value: `${roas.toFixed(2)}x`,
    detail: roas < 1.5 ? "Account ROAS is below minimum profitability threshold." : "ROAS is healthy.",
  });

  alerts.push({
    severity: freq > 5 ? "Critical" : freq > 4 ? "Warning" : "OK",
    rule: "High Frequency Alert (threshold: 4.0)",
    value: freq.toFixed(2),
    detail: freq > 4 ? "High frequency indicates creative fatigue. Refresh your ads." : "Frequency is within safe range.",
  });

  alerts.push({
    severity: ctr < 0.3 ? "Critical" : ctr < 0.5 ? "Warning" : "OK",
    rule: "Low CTR Alert (threshold: 0.5%)",
    value: `${ctr.toFixed(2)}%`,
    detail: ctr < 0.5 ? "CTR below threshold — review creative performance." : "CTR is performing well.",
  });

  const highRiskCount = campaigns.filter((c) => {
    const ci = c.insights?.data?.[0] ?? {};
    const r = getPurchaseRoas(ci.purchase_roas);
    const s = safeNum(ci.spend);
    return s > 0 && r < 1;
  }).length;

  alerts.push({
    severity: highRiskCount > 2 ? "Critical" : highRiskCount > 0 ? "Warning" : "OK",
    rule: "Wasted Spend Alert",
    value: `${highRiskCount} campaign(s)`,
    detail: highRiskCount > 0 ? `${highRiskCount} campaign(s) spending with ROAS below 1x.` : "No wasted spend detected.",
  });

  const highFreqCount = campaigns.filter((c) => {
    const ci = c.insights?.data?.[0] ?? {};
    return safeNum(ci.frequency) > 5;
  }).length;

  alerts.push({
    severity: highFreqCount > 0 ? "Warning" : "OK",
    rule: "Creative Fatigue Monitor",
    value: `${highFreqCount} campaign(s)`,
    detail: highFreqCount > 0 ? `${highFreqCount} campaign(s) have frequency > 5.` : "No creative fatigue detected.",
  });

  return alerts.sort((a, b) => {
    const order = { Critical: 0, Warning: 1, OK: 2 };
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
  OK: {
    badge: "border-green-500/50 bg-green-500/10 text-green-400",
    border: "border-l-green-500",
    icon: CheckCircle2,
    iconColor: "text-green-400",
  },
};

function NoAccountState() {
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

export default function Alerts() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data: insightsData, isLoading: insightsLoading } = useInsights(selectedAccountId, since, until);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(selectedAccountId, since, until);

  if (!selectedAccountId) return <NoAccountState />;

  const isLoading = insightsLoading || campaignsLoading;
  const insights = insightsData?.data?.[0] ?? null;
  const campaigns: any[] = campaignsData?.data ?? [];
  const alerts = isLoading ? [] : buildAlerts(insights, campaigns);

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
          <p className="text-muted-foreground mt-1 text-sm">Live performance monitors based on your account data.</p>
        </div>
        {!isLoading && (
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                {warningCount} Warning
              </Badge>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                All Clear
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
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
                  transition={{ delay: i * 0.06 }}
                >
                  <Card className={`bg-card/40 border-card-border border-l-4 ${styles.border} transition-all`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${styles.iconColor}`} />
                          <div>
                            <div className="font-medium text-sm text-foreground">{alert.rule}</div>
                            <div className="text-xs text-muted-foreground mt-1">{alert.detail}</div>
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
            Active Monitor Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "ROAS < 1.5x — Profitability alert",
              "Frequency > 4 — Fatigue warning",
              "Frequency > 5 — Critical fatigue",
              "CTR < 0.5% — Low engagement",
              "CTR < 0.3% — Critical engagement",
              "Any campaign ROAS < 1 — Wasted spend",
            ].map((rule) => (
              <div key={rule} className="flex items-center gap-2 text-sm text-muted-foreground">
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
