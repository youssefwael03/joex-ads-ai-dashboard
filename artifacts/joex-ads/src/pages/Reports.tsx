import { useState, useRef } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns, useAdSets, useInsightsDaily } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { useAccountInfo } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Loader2, LayoutDashboard, TrendingUp, DollarSign,
  BarChart2, Activity, Target, Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, fmtNumber, getPurchaseRoas, getAction, fmtCurrency } from "@/lib/metaApi";
// @ts-ignore
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveBalance(info: any): number {
  if (!info) return 0;
  const fsd = safeNum(info?.funding_source_details?.value);
  if (fsd > 0) return fsd;
  const bal = safeNum(info?.balance);
  return bal > 0 ? bal / 100 : 0;
}

function ChartTooltip({ active, payload, label, currency, isRoas, isDate }: any) {
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

function NoAccountState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
        <p className="text-muted-foreground text-sm max-w-xs">Choose an account to generate reports.</p>
      </div>
    </div>
  );
}

// ── PDF chart drawing helpers ─────────────────────────────────────────────────

function drawHBar(
  doc: jsPDF,
  items: { label: string; value: number; color: [number, number, number] }[],
  x: number,
  y: number,
  w: number,
  labelW: number,
  barH: number,
  gap: number,
  maxVal: number,
  formatVal: (v: number) => string,
): number {
  const barAreaW = w - labelW - 20;
  items.forEach((item, i) => {
    const barY = y + i * (barH + gap);
    const filled = maxVal > 0 ? Math.min((item.value / maxVal) * barAreaW, barAreaW) : 0;

    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 170);
    doc.text(item.label, x, barY + barH - 1, { maxWidth: labelW - 3 });

    doc.setFillColor(35, 35, 48);
    doc.roundedRect(x + labelW, barY, barAreaW, barH, 1, 1, "F");

    if (filled > 0) {
      doc.setFillColor(...item.color);
      doc.roundedRect(x + labelW, barY, filled, barH, 1, 1, "F");
    }

    doc.setFontSize(6);
    doc.setTextColor(200, 200, 210);
    doc.text(formatVal(item.value), x + labelW + barAreaW + 2, barY + barH - 1);
  });
  return y + items.length * (barH + gap) + 3;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const { selectedAccountId, selectedAccountName } = useAccountStore();
  const { since, until } = useDateStore();
  const fmt = useFormatCurrency();
  const currency = useAccountCurrency();

  const { data: insightsData, isLoading: insightsLoading } = useInsights(selectedAccountId, since, until);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(selectedAccountId, since, until);
  const { data: adsetsData, isLoading: adsetsLoading } = useAdSets(selectedAccountId, since, until);
  const { data: dailyData, isLoading: dailyLoading } = useInsightsDaily(selectedAccountId, since, until);
  const { data: accountInfoData } = useAccountInfo(selectedAccountId);

  const [generating, setGenerating] = useState(false);

  if (!selectedAccountId) return <NoAccountState />;

  const isLoading = insightsLoading || campaignsLoading || adsetsLoading || dailyLoading;
  const insights = insightsData?.data?.[0];
  const allCampaigns: any[] = campaignsData?.data ?? [];
  const activeCampaigns = allCampaigns.filter((c: any) => c.status === "ACTIVE");
  const adsets: any[] = (adsetsData?.data ?? []).filter((a: any) => a.status === "ACTIVE").slice(0, 20);
  const dailyRows: any[] = (dailyData?.data ?? []).slice(-30);

  const spend = safeNum(insights?.spend);
  const roas = getPurchaseRoas(insights?.purchase_roas);
  const ctr = safeNum(insights?.ctr);
  const cpc = safeNum(insights?.cpc);
  const cpm = safeNum(insights?.cpm);
  const freq = safeNum(insights?.frequency);
  const impressions = safeNum(insights?.impressions);
  const reach = safeNum(insights?.reach);
  const clicks = safeNum(insights?.clicks);
  const purchases = getAction(insights?.actions, "offsite_conversion.fb_pixel_purchase") || getAction(insights?.actions, "purchase");
  const leads = getAction(insights?.actions, "lead") || getAction(insights?.actions, "onsite_conversion.lead_grouped");
  const revenue = spend * roas;
  const cpa = purchases > 0 ? spend / purchases : 0;
  const balance = resolveBalance(accountInfoData as any);

  // ── Chart data ──────────────────────────────────────────────────────────────

  const roasChartData = activeCampaigns
    .map((c: any) => {
      const ci = c.insights?.data?.[0] ?? {};
      const r = getPurchaseRoas(ci.purchase_roas);
      const s = safeNum(ci.spend);
      if (s <= 0) return null;
      return { name: c.name?.length > 22 ? c.name.slice(0, 22) + "…" : c.name, ROAS: parseFloat(r.toFixed(2)), Spend: parseFloat(s.toFixed(2)) };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.ROAS - a.ROAS)
    .slice(0, 8) as any[];

  const dailyChartData = dailyRows.map((d: any) => ({
    date: d.date_start?.slice(5) ?? "",
    Spend: parseFloat(safeNum(d.spend).toFixed(2)),
    ROAS: parseFloat(getPurchaseRoas(d.purchase_roas).toFixed(2)),
  }));

  const kpis = [
    { label: "Total Spend", value: fmt(spend), icon: DollarSign },
    { label: "Revenue", value: fmt(revenue), icon: TrendingUp },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, icon: Target },
    { label: "Purchases", value: fmtNumber(purchases), icon: Activity },
    { label: "CTR", value: `${ctr.toFixed(2)}%`, icon: BarChart2 },
    { label: "CPC", value: fmt(cpc), icon: DollarSign },
    { label: "CPM", value: fmt(cpm), icon: DollarSign },
    { label: "CPA", value: cpa > 0 ? fmt(cpa) : "—", icon: Target },
    { label: "Frequency", value: freq.toFixed(2), icon: Activity },
    { label: "Reach", value: fmtNumber(reach), icon: Activity },
    { label: "Impressions", value: fmtNumber(impressions), icon: BarChart2 },
    { label: "Leads", value: fmtNumber(leads), icon: Activity },
  ];

  // ── PDF generation ──────────────────────────────────────────────────────────

  const generatePdf = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;
      const contentW = pageW - margin * 2;

      // ── Cover header ──
      doc.setFillColor(12, 12, 18);
      doc.rect(0, 0, pageW, 34, "F");

      doc.setFillColor(245, 166, 35);
      doc.rect(0, 0, 4, 34, "F");

      doc.setTextColor(245, 166, 35);
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

      doc.setTextColor(130, 130, 150);
      const rightX = pageW - margin;
      doc.text(`Period: ${since} → ${until}`, rightX, 14, { align: "right" });
      doc.text(`Currency: ${currency}`, rightX, 20, { align: "right" });
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, rightX, 26, { align: "right" });

      let y = 44;

      // ── KPI Grid (2 rows × 6 cols) ──
      doc.setTextColor(245, 166, 35);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Account KPIs", margin, y);
      y += 4;

      const kpiPdfData = [
        ["Total Spend", fmt(spend), "Revenue", fmt(revenue), "ROAS", `${roas.toFixed(2)}x`],
        ["CTR", `${ctr.toFixed(2)}%`, "CPM", fmt(cpm), "CPC", fmt(cpc)],
        ["CPA", cpa > 0 ? fmt(cpa) : "—", "Purchases", fmtNumber(purchases), "Leads", fmtNumber(leads)],
        ["Reach", fmtNumber(reach), "Impressions", fmtNumber(impressions), "Frequency", freq.toFixed(2)],
        ["Balance", balance > 0 ? fmtCurrency(balance, currency) : "—", "Active Campaigns", String(activeCampaigns.length), "Active Ad Sets", String(adsets.length)],
      ];

      autoTable(doc, {
        startY: y,
        body: kpiPdfData,
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

      // ── ROAS Bar Chart ──
      const pdfRoasData = activeCampaigns
        .map((c: any) => {
          const ci = c.insights?.data?.[0] ?? {};
          const r = getPurchaseRoas(ci.purchase_roas);
          const s = safeNum(ci.spend);
          if (s <= 0) return null;
          return { name: c.name?.slice(0, 30) ?? "—", roas: r, spend: s };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.roas - a.roas)
        .slice(0, 8) as any[];

      if (pdfRoasData.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }

        doc.setTextColor(245, 166, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("ROAS by Active Campaign", margin, y);
        y += 4;

        const maxRoas = Math.max(...pdfRoasData.map((d: any) => d.roas), 4);
        y = drawHBar(
          doc,
          pdfRoasData.map((d: any) => ({
            label: d.name,
            value: d.roas,
            color: d.roas >= 2.5 ? [34, 197, 94] : d.roas >= 1 ? [234, 179, 8] : [239, 68, 68],
          })),
          margin, y, contentW, 58, 7, 2.5, maxRoas,
          (v) => `${v.toFixed(2)}x`,
        );

        // Color legend
        doc.setFontSize(6);
        doc.setFillColor(34, 197, 94); doc.rect(margin, y + 1, 4, 3, "F");
        doc.setTextColor(140, 140, 155); doc.text("≥ 2.5x", margin + 6, y + 3.5);
        doc.setFillColor(234, 179, 8); doc.rect(margin + 22, y + 1, 4, 3, "F");
        doc.text("1–2.5x", margin + 28, y + 3.5);
        doc.setFillColor(239, 68, 68); doc.rect(margin + 46, y + 1, 4, 3, "F");
        doc.text("< 1x", margin + 52, y + 3.5);
        y += 9;
      }

      // ── Spend Bar Chart ──
      if (pdfRoasData.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }

        doc.setTextColor(245, 166, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Spend Distribution — Active Campaigns", margin, y);
        y += 4;

        const maxSpend = Math.max(...pdfRoasData.map((d: any) => d.spend));
        const spendSorted = [...pdfRoasData].sort((a: any, b: any) => b.spend - a.spend);
        y = drawHBar(
          doc,
          spendSorted.map((d: any) => ({
            label: d.name,
            value: d.spend,
            color: [99, 102, 241],
          })),
          margin, y, contentW, 58, 7, 2.5, maxSpend,
          (v) => fmtCurrency(v, currency),
        );
        y += 4;
      }

      // ── Daily Trend (text-based sparkline) ──
      if (dailyRows.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }

        doc.setTextColor(245, 166, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Daily Performance Trend", margin, y);
        y += 4;

        const chartH = 28;
        const chartW = contentW;
        const maxSpendVal = Math.max(...dailyRows.map((d: any) => safeNum(d.spend)), 1);
        const barW = Math.max(2, (chartW / dailyRows.length) - 0.5);

        // Background
        doc.setFillColor(20, 20, 28);
        doc.roundedRect(margin, y, chartW, chartH, 2, 2, "F");

        // Bars
        dailyRows.forEach((d: any, i: number) => {
          const s = safeNum(d.spend);
          const r = getPurchaseRoas(d.purchase_roas);
          const pct = maxSpendVal > 0 ? s / maxSpendVal : 0;
          const bH = Math.max(1, pct * (chartH - 4));
          const bX = margin + (i / dailyRows.length) * chartW + 0.5;
          const bY = y + chartH - bH - 2;
          const col: [number, number, number] = r >= 2.5 ? [34, 197, 94] : r >= 1 ? [99, 102, 241] : [239, 68, 68];
          doc.setFillColor(...col);
          doc.rect(bX, bY, barW, bH, "F");
        });

        // X-axis labels (first, mid, last)
        doc.setFontSize(6);
        doc.setTextColor(120, 120, 140);
        if (dailyRows.length > 0) {
          doc.text(dailyRows[0].date_start?.slice(5) ?? "", margin + 2, y + chartH + 4);
          doc.text(dailyRows[Math.floor(dailyRows.length / 2)]?.date_start?.slice(5) ?? "", margin + chartW / 2, y + chartH + 4, { align: "center" });
          doc.text(dailyRows[dailyRows.length - 1].date_start?.slice(5) ?? "", margin + chartW - 2, y + chartH + 4, { align: "right" });
        }
        y += chartH + 10;
      }

      // ── Active Campaigns Table ──
      if (activeCampaigns.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setTextColor(245, 166, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Active Campaigns (${activeCampaigns.length})`, margin, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["Campaign", "Spend", "ROAS", "CTR", "CPC", "CPM", "Freq", "Purchases"]],
          body: activeCampaigns
            .map((c: any) => {
              const d = c.insights?.data?.[0] ?? {};
              const r = getPurchaseRoas(d.purchase_roas);
              const p = getAction(d.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d.actions, "purchase");
              return [
                c.name?.slice(0, 36) ?? "—",
                fmtCurrency(safeNum(d.spend), currency),
                `${r.toFixed(2)}x`,
                `${safeNum(d.ctr).toFixed(2)}%`,
                fmtCurrency(safeNum(d.cpc), currency),
                fmtCurrency(safeNum(d.cpm), currency),
                safeNum(d.frequency).toFixed(2),
                fmtNumber(p),
              ];
            })
            .sort((a: any, b: any) => {
              const sa = parseFloat(a[1].replace(/[^0-9.]/g, ""));
              const sb = parseFloat(b[1].replace(/[^0-9.]/g, ""));
              return sb - sa;
            }),
          theme: "grid",
          styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [220, 220, 225], fillColor: [20, 20, 28] },
          headStyles: { fillColor: [30, 30, 42], textColor: [200, 200, 215], fontStyle: "bold", fontSize: 7.5 },
          alternateRowStyles: { fillColor: [26, 26, 36] },
          columnStyles: { 0: { cellWidth: 52 } },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 2) {
              const val = parseFloat(data.cell.text[0]);
              if (val >= 2.5) data.cell.styles.textColor = [34, 197, 94];
              else if (val >= 1) data.cell.styles.textColor = [234, 179, 8];
              else if (val > 0) data.cell.styles.textColor = [239, 68, 68];
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Active Ad Sets Table ──
      if (adsets.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        doc.setTextColor(245, 166, 35);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`Active Ad Sets (${adsets.length})`, margin, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["Ad Set", "Spend", "ROAS", "CTR", "CPC", "Freq"]],
          body: adsets
            .map((a: any) => {
              const d = a.insights?.data?.[0] ?? {};
              const r = getPurchaseRoas(d.purchase_roas);
              return [
                a.name?.slice(0, 42) ?? "—",
                fmtCurrency(safeNum(d.spend), currency),
                `${r.toFixed(2)}x`,
                `${safeNum(d.ctr).toFixed(2)}%`,
                fmtCurrency(safeNum(d.cpc), currency),
                safeNum(d.frequency).toFixed(2),
              ];
            }),
          theme: "grid",
          styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [220, 220, 225], fillColor: [20, 20, 28] },
          headStyles: { fillColor: [30, 30, 42], textColor: [200, 200, 215], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [26, 26, 36] },
          columnStyles: { 0: { cellWidth: 60 } },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Performance Analysis ──
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(245, 166, 35);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Performance Analysis & Recommendations", margin, y);
      y += 5;

      const lines: { text: string; color: [number, number, number] }[] = [];

      if (roas >= 3) lines.push({ text: `✓  ROAS ${roas.toFixed(2)}x is strong — account is profitable. Consider scaling winning campaigns.`, color: [34, 197, 94] });
      else if (roas >= 1.5) lines.push({ text: `→  ROAS ${roas.toFixed(2)}x is acceptable but has room for improvement. Optimize creatives and targeting.`, color: [234, 179, 8] });
      else if (roas > 0) lines.push({ text: `✗  ROAS ${roas.toFixed(2)}x is critically below target. Pause underperformers immediately.`, color: [239, 68, 68] });

      if (freq > 4) lines.push({ text: `⚠  Frequency ${freq.toFixed(2)} is elevated. Refresh creatives to prevent audience fatigue.`, color: [239, 68, 68] });
      else if (freq > 3) lines.push({ text: `→  Frequency ${freq.toFixed(2)} is approaching saturation. Begin testing new creative angles.`, color: [234, 179, 8] });

      if (ctr < 0.5) lines.push({ text: `✗  CTR ${ctr.toFixed(2)}% is below benchmark. Review ad hooks, copy, and creative formats.`, color: [239, 68, 68] });
      else if (ctr >= 1.5) lines.push({ text: `✓  CTR ${ctr.toFixed(2)}% is excellent. These creatives are resonating well with your audience.`, color: [34, 197, 94] });

      if (cpa > 0) lines.push({ text: `→  Average CPA is ${fmtCurrency(cpa, currency)}. Compare against your target CPA to evaluate profitability.`, color: [180, 180, 200] });

      const fatigued = activeCampaigns.filter((c: any) => safeNum(c.insights?.data?.[0]?.frequency) > 5).length;
      if (fatigued > 0) lines.push({ text: `⚠  ${fatigued} campaign(s) have frequency > 5 and urgently need new creative assets.`, color: [239, 68, 68] });

      const losing = activeCampaigns.filter((c: any) => {
        const r = getPurchaseRoas(c.insights?.data?.[0]?.purchase_roas);
        return r > 0 && r < 1 && safeNum(c.insights?.data?.[0]?.spend) > 0;
      }).length;
      if (losing > 0) lines.push({ text: `✗  ${losing} active campaign(s) have ROAS < 1x and are actively losing money — pause immediately.`, color: [239, 68, 68] });

      if (balance > 0) lines.push({ text: `✓  Account balance: ${fmtCurrency(balance, currency)}.`, color: [180, 180, 200] });

      if (lines.length === 0) lines.push({ text: "✓  Account performance is within normal parameters. Continue monitoring KPIs weekly.", color: [34, 197, 94] });

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      lines.forEach((line) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setTextColor(...line.color);
        const split = doc.splitTextToSize(line.text, contentW);
        doc.text(split, margin, y);
        y += split.length * 5 + 2;
      });

      // ── Footer ──
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFillColor(12, 12, 18);
        doc.rect(0, 285, pageW, 12, "F");
        doc.setFontSize(7);
        doc.setTextColor(80, 80, 100);
        doc.text("JOEX Ads Intelligence Platform", margin, 291);
        doc.text(`Page ${i} of ${pageCount}  |  ${selectedAccountName || selectedAccountId}  |  ${since} → ${until}`, pageW - margin, 291, { align: "right" });
      }

      doc.save(`joex-report-${selectedAccountId}-${since}-${until}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Reports
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Full performance report for <span className="text-foreground font-medium">{selectedAccountName || selectedAccountId}</span> — {since} → {until}.
            {activeCampaigns.length > 0 && <span> {activeCampaigns.length} active campaign{activeCampaigns.length !== 1 ? "s" : ""}.</span>}
          </p>
        </div>
        <Button
          onClick={generatePdf}
          disabled={isLoading || generating}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10 px-5"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Generating PDF…</>
          ) : (
            <><Download className="h-4 w-4" />Download PDF Report</>
          )}
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} className="bg-card/40 border-card-border">
                <CardContent className="p-4 space-y-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-5 w-20" />
                </CardContent>
              </Card>
            ))
          : kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="bg-card/40 border-card-border">
                  <CardContent className="p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1">
                      <Icon className="h-3 w-3" />{kpi.label}
                    </div>
                    <div className="text-sm font-bold font-mono text-foreground">{kpi.value}</div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Charts row */}
      {!isLoading && roasChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ROAS chart */}
          <Card className="bg-card/40 border-card-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                ROAS by Active Campaign
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={roasChartData} layout="vertical" margin={{ left: 0, right: 28, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}x`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#aaa" }} axisLine={false} tickLine={false} width={115} />
                  <Tooltip content={<ChartTooltip currency={currency} isRoas />} />
                  <Bar dataKey="ROAS" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {roasChartData.map((entry: any) => (
                      <Cell key={entry.name} fill={entry.ROAS >= 2.5 ? "#22c55e" : entry.ROAS >= 1 ? "#eab308" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-1 justify-center text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500 inline-block" />≥ 2.5x</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-yellow-500 inline-block" />1–2.5x</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive inline-block" />Below 1x</span>
              </div>
            </CardContent>
          </Card>

          {/* Spend chart */}
          <Card className="bg-card/40 border-card-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Spend Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart
                  data={[...roasChartData].sort((a: any, b: any) => b.Spend - a.Spend)}
                  layout="vertical"
                  margin={{ left: 0, right: 28, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#aaa" }} axisLine={false} tickLine={false} width={115} />
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                  <Bar dataKey="Spend" radius={[0, 4, 4, 0]} maxBarSize={16} fill="hsl(var(--primary) / 0.75)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily trend */}
      {!isLoading && dailyChartData.length > 1 && (
        <Card className="bg-card/40 border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Daily Performance Trend
              <Badge variant="outline" className="text-[10px] ml-auto">{dailyChartData.length} days</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyChartData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="spend" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} width={52} />
                <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}x`} width={32} />
                <Tooltip content={<ChartTooltip currency={currency} />} />
                <Line yAxisId="spend" type="monotone" dataKey="Spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line yAxisId="roas" type="monotone" dataKey="ROAS" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1 justify-center text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-primary inline-block" />Spend</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-green-500 inline-block" />ROAS</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign table preview */}
      {!isLoading && activeCampaigns.length > 0 && (
        <Card className="bg-card/40 border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Active Campaigns
              <Badge variant="outline" className="text-[10px] ml-auto">{activeCampaigns.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border">
                    {["Campaign", "Spend", "ROAS", "CTR", "CPM", "Freq", "Purchases"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium first:pl-5 last:pr-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCampaigns
                    .map((c: any) => {
                      const ci = c.insights?.data?.[0] ?? {};
                      const r = getPurchaseRoas(ci.purchase_roas);
                      const p = getAction(ci.actions, "offsite_conversion.fb_pixel_purchase") || getAction(ci.actions, "purchase");
                      return { ...c, spend: safeNum(ci.spend), roas: r, ctr: safeNum(ci.ctr), cpm: safeNum(ci.cpm), freq: safeNum(ci.frequency), purchases: p };
                    })
                    .sort((a: any, b: any) => b.spend - a.spend)
                    .map((c: any, i: number) => (
                      <tr key={c.id} className={`border-b border-card-border/50 hover:bg-card/60 transition-colors ${i % 2 === 0 ? "" : "bg-card/20"}`}>
                        <td className="px-4 py-3 pl-5 font-medium text-foreground max-w-[200px]">
                          <div className="truncate">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground">{c.objective?.replace(/_/g, " ")}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground">{c.spend > 0 ? fmt(c.spend) : "—"}</td>
                        <td className="px-4 py-3 font-mono font-semibold">
                          <span className={c.roas >= 2.5 ? "text-green-400" : c.roas >= 1 ? "text-yellow-400" : c.roas > 0 ? "text-destructive" : "text-muted-foreground"}>
                            {c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground">{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : "—"}</td>
                        <td className="px-4 py-3 font-mono text-foreground">{c.cpm > 0 ? fmt(c.cpm) : "—"}</td>
                        <td className="px-4 py-3 font-mono">
                          <span className={c.freq > 4 ? "text-destructive font-semibold" : "text-foreground"}>{c.freq > 0 ? c.freq.toFixed(1) : "—"}</span>
                        </td>
                        <td className="px-4 py-3 pr-5 font-mono text-foreground">{c.purchases > 0 ? fmtNumber(c.purchases) : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PDF contents card */}
      <Card className="bg-card/40 border-card-border border-primary/20">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-sm mb-2">PDF Report includes:</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  "Full KPI summary table (12 metrics)",
                  "ROAS bar chart by active campaign",
                  "Spend distribution bar chart",
                  "Daily spend & ROAS trend chart",
                  `Active campaigns table (${activeCampaigns.length})`,
                  `Active ad sets table (${adsets.length})`,
                  "Performance analysis & recommendations",
                  "Fatigue, waste & scaling flags",
                  `Currency: ${currency}  ·  Period: ${since} → ${until}`,
                  "JOEX branded header & footer",
                ].map((item) => (
                  <div key={item} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-primary shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
