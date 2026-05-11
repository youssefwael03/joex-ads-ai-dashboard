import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useInsightsDaily, useInsightsBreakdown } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AlertCircle, LayoutDashboard, RefreshCw } from "lucide-react";
import {
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { safeNum, fmtCurrency, fmtNumber, getAction, getPurchaseRoas } from "@/lib/metaApi";
import { useQueryClient } from "@tanstack/react-query";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  },
  itemStyle: { color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

function KpiSkeleton() {
  return (
    <Card className="bg-card/40 backdrop-blur-md border-card-border">
      <CardHeader className="pb-2">
        <Skeleton className="h-3 w-20 bg-muted/50" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-28 bg-muted/50" />
        <Skeleton className="h-2 w-16 bg-muted/30 mt-2" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ label }: { label: string }) {
  return (
    <Card className="bg-card/40 backdrop-blur-md border-card-border">
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent className="h-[280px] flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-md bg-muted/30" />
      </CardContent>
    </Card>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="text-muted-foreground text-sm max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  );
}

function NoAccountState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 gap-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Select an Ad Account</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Choose an ad account from the dropdown above to load your analytics dashboard.
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const qc = useQueryClient();

  const {
    data: insightsData,
    isLoading,
    error: insightsError,
    refetch: refetchInsights,
  } = useInsights(selectedAccountId, since, until);

  const { data: dailyData, isLoading: dailyLoading } = useInsightsDaily(selectedAccountId, since, until);
  const { data: deviceData, isLoading: deviceLoading } = useInsightsBreakdown(selectedAccountId, "device_platform", since, until);
  const { data: platformData, isLoading: platformLoading } = useInsightsBreakdown(selectedAccountId, "publisher_platform", since, until);
  const { data: countryData, isLoading: countryLoading } = useInsightsBreakdown(selectedAccountId, "country", since, until);

  if (!selectedAccountId) return <NoAccountState />;

  const insights = insightsData?.data?.[0];
  const metaErr = insightsData?.error;

  // ── KPI derivations ──────────────────────────────────────────────────────────
  const spend = safeNum(insights?.spend);
  const impressions = safeNum(insights?.impressions);
  const reach = safeNum(insights?.reach);
  const clicks = safeNum(insights?.clicks);
  const ctr = safeNum(insights?.ctr);
  const cpm = safeNum(insights?.cpm);
  const cpc = safeNum(insights?.cpc);
  const frequency = safeNum(insights?.frequency);
  const roas = getPurchaseRoas(insights?.purchase_roas);
  const purchases = getAction(insights?.actions, "offsite_conversion.fb_pixel_purchase")
    || getAction(insights?.actions, "purchase");
  const revenue = spend > 0 && roas > 0 ? spend * roas : 0;
  const cpa = purchases > 0 ? spend / purchases : 0;
  const conversionRate = clicks > 0 && purchases > 0 ? (purchases / clicks) * 100 : 0;
  const linkClicks = getAction(insights?.actions, "link_click")
    || getAction(insights?.actions, "outbound_click");

  const kpis = [
    { label: "Total Spend", value: fmtCurrency(spend), highlight: false },
    { label: "Revenue", value: fmtCurrency(revenue), highlight: revenue > 0 },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, highlight: roas >= 2 },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, highlight: false },
    { label: "CPM", value: fmtCurrency(cpm), highlight: false },
    { label: "CPC", value: fmtCurrency(cpc), highlight: false },
    { label: "CPA", value: cpa > 0 ? fmtCurrency(cpa) : "—", highlight: false },
    { label: "Frequency", value: frequency.toFixed(2), highlight: frequency > 4 },
    { label: "Reach", value: fmtNumber(reach), highlight: false },
    { label: "Impressions", value: fmtNumber(impressions), highlight: false },
    { label: "Link Clicks", value: fmtNumber(linkClicks), highlight: false },
    { label: "Purchases", value: fmtNumber(purchases), highlight: purchases > 0 },
    { label: "Conv. Rate", value: conversionRate > 0 ? `${conversionRate.toFixed(2)}%` : "—", highlight: false },
  ];

  // ── Chart data ───────────────────────────────────────────────────────────────
  const dailyChartData = (dailyData?.data ?? []).map((d: any) => {
    const daySpend = safeNum(d.spend);
    const dayRoas = getPurchaseRoas(d.purchase_roas);
    return {
      date: d.date_start?.slice(5) ?? "",
      spend: daySpend,
      revenue: daySpend > 0 && dayRoas > 0 ? +(daySpend * dayRoas).toFixed(2) : 0,
      roas: dayRoas,
      ctr: safeNum(d.ctr),
    };
  });

  const deviceChartData = (deviceData?.data ?? [])
    .filter((d: any) => d.device_platform)
    .map((d: any) => ({
      name: String(d.device_platform ?? "Unknown"),
      value: safeNum(d.spend),
    }));

  const platformChartData = (platformData?.data ?? [])
    .filter((d: any) => d.publisher_platform)
    .map((d: any) => ({
      name: String(d.publisher_platform ?? "Unknown"),
      spend: safeNum(d.spend),
    }));

  const countryChartData = (countryData?.data ?? [])
    .filter((d: any) => d.country)
    .sort((a: any, b: any) => safeNum(b.spend) - safeNum(a.spend))
    .slice(0, 10)
    .map((d: any) => ({
      name: String(d.country ?? "??"),
      spend: safeNum(d.spend),
    }));

  const hasError = !!insightsError || !!metaErr;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground drop-shadow-[0_0_12px_rgba(252,211,77,0.2)]">
            Executive Dashboard
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            High-level performance metrics for your selected account.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => qc.invalidateQueries({ queryKey: ["meta"] })}
          title="Refresh all data"
          className="text-muted-foreground hover:text-foreground"
          data-testid="btn-refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Error state */}
      {hasError && !isLoading && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <EmptyState
              message={
                metaErr
                  ? `Meta API error: ${(metaErr as any)?.message ?? JSON.stringify(metaErr)}`
                  : `Failed to load insights: ${(insightsError as Error)?.message}`
              }
              onRetry={() => refetchInsights()}
            />
          </CardContent>
        </Card>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 13 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi, i) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
              >
                <Card
                  className={`bg-card/40 backdrop-blur-md border-card-border transition-all duration-300 hover:shadow-[0_0_20px_rgba(252,211,77,0.08)] hover:border-primary/20 group overflow-hidden relative`}
                  data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div
                      className={`text-xl font-bold tabular-nums ${
                        kpi.highlight ? "text-primary drop-shadow-[0_0_8px_rgba(252,211,77,0.3)]" : "text-card-foreground"
                      }`}
                    >
                      {insights || !hasError ? kpi.value : "—"}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue vs Spend */}
        {dailyLoading ? (
          <ChartSkeleton label="Revenue vs Spend" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Revenue vs Spend</CardTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-2))] inline-block" />Revenue</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))] inline-block" />Spend</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[280px]">
              {dailyChartData.length === 0 ? (
                <EmptyState message="No daily data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChartData}>
                    <defs>
                      <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={55} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, name: string) => [`$${safeNum(v).toFixed(2)}`, name === "revenue" ? "Revenue" : "Spend"]} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" fill="url(#gRevenue)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="spend" stroke="hsl(var(--chart-1))" fill="url(#gSpend)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* ROAS trend */}
        {dailyLoading ? (
          <ChartSkeleton label="ROAS Trend" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader><CardTitle className="text-base">ROAS Trend</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {dailyChartData.length === 0 ? (
                <EmptyState message="No ROAS data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`${safeNum(v).toFixed(2)}x`, "ROAS"]} />
                    <Line type="monotone" dataKey="roas" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* CTR trend */}
        {dailyLoading ? (
          <ChartSkeleton label="CTR Trend" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader><CardTitle className="text-base">CTR Trend</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {dailyChartData.length === 0 ? (
                <EmptyState message="No CTR data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`${safeNum(v).toFixed(2)}%`, "CTR"]} />
                    <Line type="monotone" dataKey="ctr" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Platform performance */}
        {platformLoading ? (
          <ChartSkeleton label="Platform Performance" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader><CardTitle className="text-base">Platform Performance (Spend)</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {platformChartData.length === 0 ? (
                <EmptyState message="No platform breakdown data." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={80} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`$${safeNum(v).toFixed(2)}`, "Spend"]} />
                    <Bar dataKey="spend" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Device breakdown */}
        {deviceLoading ? (
          <ChartSkeleton label="Device Breakdown" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader><CardTitle className="text-base">Device Breakdown (Spend)</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {deviceChartData.length === 0 ? (
                <EmptyState message="No device breakdown data." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={deviceChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none">
                      {deviceChartData.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`$${safeNum(v).toFixed(2)}`, "Spend"]} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top countries */}
        {countryLoading ? (
          <ChartSkeleton label="Top Countries" />
        ) : (
          <Card className="bg-card/40 backdrop-blur-md border-card-border">
            <CardHeader><CardTitle className="text-base">Top Countries by Spend</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {countryChartData.length === 0 ? (
                <EmptyState message="No country breakdown data." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={30} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`$${safeNum(v).toFixed(2)}`, "Spend"]} />
                    <Bar dataKey="spend" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
