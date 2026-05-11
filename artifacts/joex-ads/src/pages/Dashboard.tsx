import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useInsightsDaily, useInsightsBreakdown } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();

  const { data: insightsData, isLoading } = useInsights(selectedAccountId, since, until);
  const { data: dailyData, isLoading: dailyLoading } = useInsightsDaily(selectedAccountId, since, until);
  const { data: deviceData, isLoading: deviceLoading } = useInsightsBreakdown(selectedAccountId, "device", since, until);
  const { data: platformData, isLoading: platformLoading } = useInsightsBreakdown(selectedAccountId, "publisher_platform", since, until);

  const insights = insightsData?.data?.[0];

  const kpis = [
    { label: "Total Spend", value: insights?.spend ? `$${Number(insights.spend).toFixed(2)}` : "$0.00" },
    { label: "Revenue", value: insights?.action_values ? `$${insights.action_values.find((a:any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0.00"}` : "$0.00" },
    { label: "ROAS", value: insights?.purchase_roas ? `${Number(insights.purchase_roas[0]?.value || 0).toFixed(2)}x` : "0.00x" },
    { label: "CTR", value: insights?.ctr ? `${Number(insights.ctr).toFixed(2)}%` : "0.00%" },
    { label: "CPM", value: insights?.cpm ? `$${Number(insights.cpm).toFixed(2)}` : "$0.00" },
    { label: "CPC", value: insights?.cpc ? `$${Number(insights.cpc).toFixed(2)}` : "$0.00" },
    { label: "Purchases", value: insights?.actions ? insights.actions.find((a:any) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value || "0" : "0" },
    { label: "Impressions", value: insights?.impressions ? Number(insights.impressions).toLocaleString() : "0" },
  ];

  const dailyChartData = dailyData?.data?.map((d: any) => ({
    date: d.date_start,
    spend: Number(d.spend || 0),
    roas: Number(d.purchase_roas?.[0]?.value || 0),
    ctr: Number(d.ctr || 0)
  })) || [];

  const deviceChartData = deviceData?.data?.map((d: any) => ({
    name: d.device || "Unknown",
    value: Number(d.spend || 0)
  })) || [];

  const platformChartData = platformData?.data?.map((d: any) => ({
    name: d.publisher_platform || "Unknown",
    spend: Number(d.spend || 0)
  })) || [];

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground drop-shadow-[0_0_12px_rgba(252,211,77,0.2)]">Executive Dashboard</h2>
        <p className="text-muted-foreground mt-1">High-level performance metrics for your selected account.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
        {kpis.map((kpi, i) => (
          <motion.div 
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
          >
            <Card className="bg-card/40 backdrop-blur-md border-card-border hover:border-primary/30 transition-all duration-300 hover:shadow-[0_0_15px_rgba(252,211,77,0.1)] group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 bg-muted/50" />
                ) : (
                  <div className={`text-2xl font-bold ${kpi.label === 'ROAS' || kpi.label === 'Revenue' ? 'text-primary drop-shadow-[0_0_8px_rgba(252,211,77,0.3)]' : 'text-card-foreground'}`}>
                    {kpi.value}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="bg-card/40 backdrop-blur-md border-card-border hover:border-border transition-colors">
          <CardHeader>
            <CardTitle>Spend Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {dailyLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChartData}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="spend" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#colorSpend)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 backdrop-blur-md border-card-border hover:border-border transition-colors">
          <CardHeader>
            <CardTitle>ROAS Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {dailyLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Line type="monotone" dataKey="roas" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 backdrop-blur-md border-card-border hover:border-border transition-colors">
          <CardHeader>
            <CardTitle>Platform Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {platformLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="spend" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 backdrop-blur-md border-card-border hover:border-border transition-colors">
          <CardHeader>
            <CardTitle>Device Breakdown (Spend)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {deviceLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {deviceChartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
