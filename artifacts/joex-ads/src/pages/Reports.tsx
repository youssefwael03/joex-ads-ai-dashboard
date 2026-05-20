import { useState, useRef, useMemo } from "react";
import { useAccountStore } from "@/store/accountStore";
import {
  useInsights, useCampaigns, useAdSets, useInsightsDaily,
  useInsightsBreakdown, useAccountInfo,
} from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText, Download, Loader2, LayoutDashboard, TrendingUp,
  DollarSign, ShoppingCart, TrendingDown, RefreshCw, ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, fmtNumber, getPurchaseRoas, getAction, fmtCurrency } from "@/lib/metaApi";
// @ts-ignore
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie, Legend,
} from "recharts";

// ── Date presets ──────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "اليوم",          value: "today",      days: 0  },
  { label: "أمس",            value: "yesterday",  days: 1  },
  { label: "آخر 7 أيام",    value: "last_7",     days: 7  },
  { label: "آخر 30 يوم",    value: "last_30",    days: 30 },
  { label: "آخر 90 يوم",    value: "last_90",    days: 90 },
  { label: "آخر 365 يوم",   value: "last_365",   days: 365},
  { label: "هذا الشهر",      value: "this_month", days: -1 },
  { label: "هذه السنة",      value: "this_year",  days: -2 },
  { label: "مخصص",           value: "custom",     days: -3 },
];

function fmt(d: Date): string { return d.toISOString().split("T")[0]; }

function getDateRange(preset: string, customFrom?: string, customTo?: string): { since: string; until: string } {
  const today = new Date();
  switch (preset) {
    case "today":
      return { since: fmt(today), until: fmt(today) };
    case "yesterday": {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      return { since: fmt(y), until: fmt(y) };
    }
    case "this_month":
      return { since: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), until: fmt(today) };
    case "this_year":
      return { since: `${today.getFullYear()}-01-01`, until: fmt(today) };
    case "custom":
      return { since: customFrom ?? fmt(today), until: customTo ?? fmt(today) };
    default: {
      const days = DATE_PRESETS.find((p) => p.value === preset)?.days ?? 30;
      const from = new Date(today); from.setDate(today.getDate() - days);
      return { since: fmt(from), until: fmt(today) };
    }
  }
}

function getPrevPeriod(since: string, until: string): { since: string; until: string } {
  const s = new Date(since);
  const u = new Date(until);
  const diff = Math.round((u.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevUntil = new Date(s); prevUntil.setDate(s.getDate() - 1);
  const prevSince = new Date(prevUntil); prevSince.setDate(prevUntil.getDate() - diff + 1);
  return { since: fmt(prevSince), until: fmt(prevUntil) };
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency, isRoas, isPct }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-white/70 mb-1 truncate max-w-[200px]">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}:</span>
          <span className="font-mono font-semibold text-white">
            {isRoas ? `${Number(p.value).toFixed(2)}x`
              : isPct ? `${Number(p.value).toFixed(2)}%`
              : fmtCurrency(p.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function NoAccountState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2">اختر حساب إعلاني</h3>
        <p className="text-muted-foreground text-sm max-w-xs">اختر حسابًا لعرض التقارير.</p>
      </div>
    </div>
  );
}

// ── KPI delta helper ──────────────────────────────────────────────────────────

function Delta({ curr, prev, higherIsBetter = true }: { curr: number; prev: number; higherIsBetter?: boolean }) {
  if (!prev || prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  const positive = higherIsBetter ? pct >= 0 : pct <= 0;
  return (
    <span className={`text-xs font-mono flex items-center gap-0.5 ${positive ? "text-green-400" : "text-red-400"}`}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const { selectedAccountId, selectedAccountName } = useAccountStore();
  const formatCurr = useFormatCurrency();
  const currency = useAccountCurrency();

  // ── Local date state ──────────────────────────────────────────────────────
  const [preset, setPreset]         = useState("last_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [presetOpen, setPresetOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { since, until } = useMemo(
    () => getDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const { since: prevSince, until: prevUntil } = useMemo(() => getPrevPeriod(since, until), [since, until]);

  const presetLabel = DATE_PRESETS.find((p) => p.value === preset)?.label ?? "آخر 30 يوم";

  // ── API hooks ─────────────────────────────────────────────────────────────
  const { data: insightsData,     isLoading: insightsLoading }  = useInsights(selectedAccountId, since, until);
  const { data: prevInsightsData                              }  = useInsights(selectedAccountId, prevSince, prevUntil);
  const { data: campaignsData,    isLoading: campaignsLoading }  = useCampaigns(selectedAccountId, since, until);
  const { data: adsetsData,       isLoading: adsetsLoading    }  = useAdSets(selectedAccountId, since, until);
  const { data: dailyData,        isLoading: dailyLoading     }  = useInsightsDaily(selectedAccountId, since, until);
  const { data: genderData                                    }  = useInsightsBreakdown(selectedAccountId, "gender", since, until);
  const { data: ageData                                       }  = useInsightsBreakdown(selectedAccountId, "age", since, until);
  const { data: accountInfoData                               }  = useAccountInfo(selectedAccountId);

  const chartsRef = useRef<HTMLDivElement>(null);

  if (!selectedAccountId) return <NoAccountState />;

  const isLoading = insightsLoading || campaignsLoading || adsetsLoading || dailyLoading;

  // ── Current period KPIs ───────────────────────────────────────────────────
  const ins     = insightsData?.data?.[0];
  const spend   = safeNum(ins?.spend);
  const roas    = getPurchaseRoas(ins?.purchase_roas);
  const ctr     = safeNum(ins?.ctr);
  const cpc     = safeNum(ins?.cpc);
  const cpm     = safeNum(ins?.cpm);
  const freq    = safeNum(ins?.frequency);
  const impressions = safeNum(ins?.impressions);
  const reach   = safeNum(ins?.reach);
  const clicks  = safeNum(ins?.clicks);
  const purchases = getAction(ins?.actions, "offsite_conversion.fb_pixel_purchase") || getAction(ins?.actions, "purchase");
  const leads   = getAction(ins?.actions, "lead") || getAction(ins?.actions, "onsite_conversion.lead_grouped");
  const revenue = spend * roas;
  const cpa     = purchases > 0 ? spend / purchases : 0;

  // ── Previous period KPIs ──────────────────────────────────────────────────
  const prevIns       = prevInsightsData?.data?.[0];
  const prevSpend     = safeNum(prevIns?.spend);
  const prevRoas      = getPurchaseRoas(prevIns?.purchase_roas);
  const prevCpm       = safeNum(prevIns?.cpm);
  const prevPurchases = getAction(prevIns?.actions, "offsite_conversion.fb_pixel_purchase") || getAction(prevIns?.actions, "purchase");

  // ── Campaign data ─────────────────────────────────────────────────────────
  const allCampaigns: any[] = campaignsData?.data ?? [];
  const activeCampaigns     = allCampaigns.filter((c: any) => c.status === "ACTIVE");
  const pausedCampaigns     = allCampaigns.filter((c: any) => c.status === "PAUSED");
  const adsets: any[]       = (adsetsData?.data ?? []).filter((a: any) => a.status === "ACTIVE").slice(0, 20);
  const dailyRows: any[]    = (dailyData?.data ?? []).slice(-90);

  // ── Chart data ────────────────────────────────────────────────────────────

  // Dual-axis area chart: daily spend + ROAS
  const dailyChartData = dailyRows.map((d: any) => ({
    date:  d.date_start?.slice(5) ?? "",
    Spend: parseFloat(safeNum(d.spend).toFixed(2)),
    ROAS:  parseFloat(getPurchaseRoas(d.purchase_roas).toFixed(2)),
  }));

  // Horizontal bar chart: top 10 campaigns by spend, colored by ROAS
  const campaignSpendData = allCampaigns
    .map((c: any) => {
      const ci = c.insights?.data?.[0] ?? {};
      const r  = getPurchaseRoas(ci.purchase_roas);
      const s  = safeNum(ci.spend);
      if (s <= 0) return null;
      return {
        name:   c.name?.length > 28 ? c.name.slice(0, 28) + "…" : c.name,
        Spend:  parseFloat(s.toFixed(2)),
        roas:   r,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.Spend - a.Spend)
    .slice(0, 10) as any[];

  // Gender donut
  const genderRows: any[] = genderData?.data ?? [];
  const genderChartData = genderRows.map((g: any) => ({
    name:  g.gender === "male" ? "ذكور" : g.gender === "female" ? "إناث" : "غير محدد",
    value: parseFloat(safeNum(g.spend).toFixed(2)),
  })).filter((g: any) => g.value > 0);

  // Age bar
  const ageRows: any[] = ageData?.data ?? [];
  const ageChartData = ageRows
    .map((a: any) => ({
      age:   a.age ?? "—",
      Spend: parseFloat(safeNum(a.spend).toFixed(2)),
    }))
    .filter((a: any) => a.Spend > 0)
    .sort((a: any, b: any) => {
      const aNum = parseInt(a.age?.split("-")[0] ?? "0");
      const bNum = parseInt(b.age?.split("-")[0] ?? "0");
      return aNum - bNum;
    });

  // Day of week from daily rows
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const dayMap: Record<number, { spend: number; roas: number; count: number }> = {};
  dailyRows.forEach((d: any) => {
    const dt  = new Date(d.date_start);
    const day = dt.getDay();
    if (!dayMap[day]) dayMap[day] = { spend: 0, roas: 0, count: 0 };
    dayMap[day].spend += safeNum(d.spend);
    dayMap[day].roas  += getPurchaseRoas(d.purchase_roas);
    dayMap[day].count++;
  });
  const dayChartData = Object.entries(dayMap).map(([day, v]) => ({
    name:  dayNames[Number(day)],
    Spend: parseFloat((v.spend / v.count).toFixed(2)),
  })).sort((a: any, b: any) => b.Spend - a.Spend);

  const GENDER_COLORS = ["#6366f1", "#ec4899", "#a78bfa"];
  const ROAS_COLOR = (r: number) => r >= 6 ? "#22c55e" : r >= 4 ? "#eab308" : "#ef4444";

  // ── PDF generation ─────────────────────────────────────────────────────────

  const generatePdf = async () => {
    setGenerating(true);
    try {
      const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;
      const contentW = pageW - margin * 2;

      // Header
      doc.setFillColor(12, 12, 18);
      doc.rect(0, 0, pageW, 34, "F");
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 0, 4, 34, "F");
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("JOEX ADS", margin + 2, 14);
      doc.setTextColor(200, 200, 210);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Performance Marketing Report", margin + 2, 21);
      doc.setTextColor(130, 130, 150);
      doc.setFontSize(8);
      doc.text(`Account: ${selectedAccountName || selectedAccountId}`, margin + 2, 28);
      const rightX = pageW - margin;
      doc.text(`Period: ${since} -> ${until}`, rightX, 14, { align: "right" });
      doc.text(`Currency: ${currency}`, rightX, 20, { align: "right" });
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, rightX, 26, { align: "right" });

      let y = 44;

      // KPI table
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Account KPIs", margin, y);
      y += 4;

      const kpiPdf = [
        ["Total Spend", formatCurr(spend), "Revenue", formatCurr(revenue), "ROAS", `${roas.toFixed(2)}x`],
        ["CTR", `${ctr.toFixed(2)}%`, "CPM", formatCurr(cpm), "CPC", formatCurr(cpc)],
        ["CPA", cpa > 0 ? formatCurr(cpa) : "—", "Purchases", fmtNumber(purchases), "Leads", fmtNumber(leads)],
        ["Reach", fmtNumber(reach), "Impressions", fmtNumber(impressions), "Frequency", freq.toFixed(2)],
        ["Active Campaigns", String(activeCampaigns.length), "Paused Campaigns", String(pausedCampaigns.length), "Total Campaigns", String(allCampaigns.length)],
      ];
      autoTable(doc, {
        startY: y,
        body: kpiPdf,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [220, 220, 225], fillColor: [20, 20, 28] },
        columnStyles: {
          0: { fontStyle: "bold", textColor: [160, 160, 180], cellWidth: 28 },
          1: { fontStyle: "bold", textColor: [245, 245, 250], cellWidth: 22 },
          2: { fontStyle: "bold", textColor: [160, 160, 180], cellWidth: 28 },
          3: { fontStyle: "bold", textColor: [245, 245, 250], cellWidth: 22 },
          4: { fontStyle: "bold", textColor: [160, 160, 180], cellWidth: 28 },
          5: { fontStyle: "bold", textColor: [245, 245, 250], cellWidth: 22 },
        },
        alternateRowStyles: { fillColor: [26, 26, 36] },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Capture charts section as image
      if (chartsRef.current) {
        try {
          const canvas = await html2canvas(chartsRef.current, {
            backgroundColor: "#0a0a0a",
            scale: 1.5,
            logging: false,
          });
          const imgData = canvas.toDataURL("image/png");
          const imgH = (canvas.height / canvas.width) * contentW;
          if (y + imgH > 280) { doc.addPage(); y = 20; }
          doc.setTextColor(212, 175, 55);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("Performance Charts", margin, y);
          y += 4;
          doc.addImage(imgData, "PNG", margin, y, contentW, imgH);
          y += imgH + 10;
        } catch (_) { /* skip charts if capture fails */ }
      }

      // Campaigns table
      if (allCampaigns.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setTextColor(212, 175, 55);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Campaigns (${allCampaigns.length})`, margin, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["Campaign", "Status", "Spend", "ROAS", "CTR", "CPM", "Purchases", "Daily Budget"]],
          body: allCampaigns
            .map((c: any) => {
              const d  = c.insights?.data?.[0] ?? {};
              const r  = getPurchaseRoas(d.purchase_roas);
              const p  = getAction(d.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d.actions, "purchase");
              const db = safeNum(c.daily_budget) / 100;
              return [
                c.name?.slice(0, 34) ?? "—",
                c.status,
                fmtCurrency(safeNum(d.spend), currency),
                `${r.toFixed(2)}x`,
                `${safeNum(d.ctr).toFixed(2)}%`,
                fmtCurrency(safeNum(d.cpm), currency),
                fmtNumber(p),
                db > 0 ? fmtCurrency(db, currency) : "—",
              ];
            })
            .sort((a: any, b: any) => parseFloat(b[2].replace(/[^0-9.]/g, "")) - parseFloat(a[2].replace(/[^0-9.]/g, ""))),
          theme: "grid",
          styles: { fontSize: 7, cellPadding: 2, textColor: [220, 220, 225], fillColor: [20, 20, 28] },
          headStyles: { fillColor: [30, 30, 42], textColor: [200, 200, 215], fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [26, 26, 36] },
          columnStyles: { 0: { cellWidth: 42 } },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              const v = parseFloat(data.cell.text[0]);
              if (v >= 6) data.cell.styles.textColor = [34, 197, 94];
              else if (v >= 4) data.cell.styles.textColor = [234, 179, 8];
              else if (v > 0) data.cell.styles.textColor = [239, 68, 68];
            }
            if (data.section === "body" && data.column.index === 1) {
              data.cell.styles.textColor = data.cell.text[0] === "ACTIVE" ? [34, 197, 94] : [120, 120, 140];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // Footer
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(12, 12, 18);
        doc.rect(0, 285, pageW, 12, "F");
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 100);
        doc.text("تقرير معد بواسطة JOEX Dashboard", margin, 291);
        doc.text(`Page ${i} of ${pageCount}  |  ${selectedAccountName || selectedAccountId}  |  ${since} -> ${until}`, pageW - margin, 291, { align: "right" });
      }

      const safeName = (selectedAccountName || selectedAccountId || "account").replace(/[^a-zA-Z0-9_-]/g, "_");
      doc.save(`${safeName}_report_${since}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10">

      {/* Top bar */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            التقارير
          </h2>
          <p className="text-muted-foreground mt-1 text-sm" dir="rtl">
            <span className="text-foreground font-medium">{selectedAccountName || selectedAccountId}</span>
            {" — "}{since} إلى {until}
            {activeCampaigns.length > 0 && <span> · {activeCampaigns.length} حملة نشطة</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date preset dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 text-sm border-white/10 bg-card/50"
              onClick={() => setPresetOpen((o) => !o)}
            >
              {presetLabel}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
            {presetOpen && (
              <div className="absolute right-0 top-10 z-50 bg-[#161622] border border-white/10 rounded-xl shadow-2xl w-44 py-1 overflow-hidden">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    dir="rtl"
                    className={`w-full text-right px-4 py-2 text-sm hover:bg-white/5 transition-colors ${preset === p.value ? "text-primary font-semibold" : "text-foreground"}`}
                    onClick={() => { setPreset(p.value); setPresetOpen(false); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom date pickers (shown only when custom selected) */}
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 text-sm border-white/10 bg-card/50 w-36"
              />
              <span className="text-muted-foreground text-sm">إلى</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 text-sm border-white/10 bg-card/50 w-36"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-9 border-white/10 bg-card/50 gap-2 text-sm"
            onClick={() => setPreset(preset)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>

          <Button
            onClick={generatePdf}
            disabled={isLoading || generating}
            size="sm"
            className="h-9 bg-primary hover:bg-primary/90 text-black gap-2 text-sm font-semibold"
          >
            {generating ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />جار التحميل…</>
            ) : (
              <><Download className="h-3.5 w-3.5" />تحميل PDF</>
            )}
          </Button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card/40 border-card-border">
              <CardContent className="p-5 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-12" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {[
              { label: "الإنفاق",    value: formatCurr(spend),             icon: DollarSign,    curr: spend,     prev: prevSpend,     higher: false },
              { label: "ROAS",       value: `${roas.toFixed(2)}x`,         icon: TrendingUp,    curr: roas,      prev: prevRoas,      higher: true  },
              { label: "مشتريات",   value: fmtNumber(purchases),           icon: ShoppingCart,  curr: purchases, prev: prevPurchases, higher: true  },
              { label: "CPM",        value: formatCurr(cpm),               icon: DollarSign,    curr: cpm,       prev: prevCpm,       higher: false },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <Card className="bg-card/40 border-card-border hover:border-primary/30 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-medium" dir="rtl">{kpi.label}</span>
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold font-mono text-foreground mb-1">{kpi.value}</p>
                      <Delta curr={kpi.curr} prev={kpi.prev} higherIsBetter={kpi.higher} />
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* Secondary KPI strip */}
      {!isLoading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[
            { label: "الإيرادات",    value: formatCurr(revenue)       },
            { label: "CTR",          value: `${ctr.toFixed(2)}%`       },
            { label: "CPC",          value: formatCurr(cpc)            },
            { label: "CPA",          value: cpa > 0 ? formatCurr(cpa) : "—" },
            { label: "التكرار",      value: freq.toFixed(2)            },
            { label: "الوصول",       value: fmtNumber(reach)           },
            { label: "انطباعات",     value: fmtNumber(impressions)     },
            { label: "ليدز",         value: fmtNumber(leads)           },
            { label: "حملات نشطة",  value: String(activeCampaigns.length) },
            { label: "حملات موقوفة", value: String(pausedCampaigns.length) },
            { label: "إجمالي حملات", value: String(allCampaigns.length) },
            { label: "أد سيتس نشطة", value: String(adsets.length)     },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card/30 border-card-border">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5" dir="rtl">{kpi.label}</div>
                <div className="text-sm font-bold font-mono text-foreground">{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts section — captured by html2canvas for PDF */}
      <div ref={chartsRef} className="space-y-4" style={{ background: "transparent" }}>

        {/* Charts row 1: Spend/ROAS area chart + Campaign spend bar */}
        {!isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Dual-axis area chart: Spend + ROAS */}
            <Card className="bg-card/40 border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2" dir="rtl">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  الإنفاق اليومي vs ROAS
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyChartData} margin={{ left: 0, right: 10, top: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis yAxisId="spend" tick={{ fontSize: 9, fill: "#999" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(v)} />
                      <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 9, fill: "#999" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}x`} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Area yAxisId="spend" type="monotone" dataKey="Spend" stroke="#D4AF37" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                      <Area yAxisId="roas"  type="monotone" dataKey="ROAS"  stroke="#6366f1" strokeWidth={2} fill="url(#roasGrad)"  dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات يومية</div>
                )}
                <div className="flex gap-4 mt-1 justify-center text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#D4AF37] inline-block" />الإنفاق</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />ROAS</span>
                </div>
              </CardContent>
            </Card>

            {/* Horizontal bar: campaign spend colored by ROAS */}
            <Card className="bg-card/40 border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2" dir="rtl">
                  <DollarSign className="h-4 w-4 text-primary" />
                  توزيع الإنفاق على الحملات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {campaignSpendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={campaignSpendData} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#aaa" }} axisLine={false} tickLine={false} width={105} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Bar dataKey="Spend" radius={[0, 4, 4, 0]} maxBarSize={14}>
                        {campaignSpendData.map((entry: any) => (
                          <Cell key={entry.name} fill={ROAS_COLOR(entry.roas)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">لا توجد حملات بإنفاق</div>
                )}
                <div className="flex gap-4 mt-1 justify-center text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500 inline-block" />ROAS &gt; 6x</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-yellow-500 inline-block" />4–6x</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500 inline-block" />&lt; 4x</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts row 2: Gender donut + Age bar + Day bar */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Gender donut */}
            <Card className="bg-card/40 border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" dir="rtl">التوزيع حسب الجنس</CardTitle>
              </CardHeader>
              <CardContent>
                {genderChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={genderChartData}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {genderChartData.map((_: any, i: number) => (
                          <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtCurrency(v, currency)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs text-center">بيانات الجنس غير متوفرة</div>
                )}
              </CardContent>
            </Card>

            {/* Age bar */}
            <Card className="bg-card/40 border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" dir="rtl">التوزيع حسب العمر</CardTitle>
              </CardHeader>
              <CardContent>
                {ageChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ageChartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="age" tick={{ fontSize: 9, fill: "#888" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(v)} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Bar dataKey="Spend" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs text-center">بيانات العمر غير متوفرة</div>
                )}
              </CardContent>
            </Card>

            {/* Day of week */}
            <Card className="bg-card/40 border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" dir="rtl">أفضل أيام الأداء</CardTitle>
              </CardHeader>
              <CardContent>
                {dayChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={dayChartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#888" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNumber(v)} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Bar dataKey="Spend" radius={[3, 3, 0, 0]} maxBarSize={28}>
                        {dayChartData.map((entry: any, i: number) => (
                          <Cell key={i} fill={i === 0 ? "#D4AF37" : "#6366f1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs text-center">بيانات أيام الأسبوع غير متوفرة</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Campaigns table */}
      {!isLoading && allCampaigns.length > 0 && (
        <Card className="bg-card/40 border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" dir="rtl">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              الحملات ({allCampaigns.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="border-b border-white/5 text-[11px] text-muted-foreground uppercase tracking-wide">
                    {["اسم الحملة", "الحالة", "الإنفاق", "ROAS", "CTR", "CPM", "مشتريات", "الميزانية اليومية"].map((h) => (
                      <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...allCampaigns]
                    .sort((a: any, b: any) => safeNum(b.insights?.data?.[0]?.spend) - safeNum(a.insights?.data?.[0]?.spend))
                    .map((c: any) => {
                      const d    = c.insights?.data?.[0] ?? {};
                      const r    = getPurchaseRoas(d.purchase_roas);
                      const s    = safeNum(d.spend);
                      const p    = getAction(d.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d.actions, "purchase");
                      const db   = safeNum(c.daily_budget) / 100;
                      const isActive = c.status === "ACTIVE";
                      const roasColor = r >= 6 ? "text-green-400" : r >= 4 ? "text-yellow-400" : r > 0 ? "text-red-400" : "text-muted-foreground";
                      return (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">{c.name}</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-2 py-0.5 ${isActive ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-white/10 text-muted-foreground bg-white/5"}`}
                            >
                              {isActive ? "نشط" : "موقوف"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground">{s > 0 ? formatCurr(s) : "—"}</td>
                          <td className={`px-4 py-3 font-mono font-semibold ${roasColor}`}>{r > 0 ? `${r.toFixed(2)}x` : "—"}</td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">{safeNum(d.ctr) > 0 ? `${safeNum(d.ctr).toFixed(2)}%` : "—"}</td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">{safeNum(d.cpm) > 0 ? formatCurr(safeNum(d.cpm)) : "—"}</td>
                          <td className="px-4 py-3 font-mono text-foreground">{p > 0 ? fmtNumber(p) : "—"}</td>
                          <td className="px-4 py-3 font-mono text-foreground">{db > 0 ? formatCurr(db) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton for table */}
      {isLoading && (
        <Card className="bg-card/40 border-card-border">
          <CardContent className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
