import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useInsights, useCampaigns, useAdSets } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, fmtNumber, getPurchaseRoas, getAction } from "@/lib/metaApi";
// @ts-ignore — jspdf-autotable augments jsPDF prototype at import time
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";

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

export default function Reports() {
  const { selectedAccountId, selectedAccountName } = useAccountStore();
  const { since, until } = useDateStore();
  const fmt = useFormatCurrency();
  const currency = useAccountCurrency();

  const { data: insightsData, isLoading: insightsLoading } = useInsights(selectedAccountId, since, until);
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(selectedAccountId, since, until);
  const { data: adsetsData, isLoading: adsetsLoading } = useAdSets(selectedAccountId, since, until);

  const [generating, setGenerating] = useState(false);

  if (!selectedAccountId) return <NoAccountState />;

  const isLoading = insightsLoading || campaignsLoading || adsetsLoading;
  const insights = insightsData?.data?.[0];
  const campaigns: any[] = (campaignsData?.data ?? []).slice(0, 20);
  const adsets: any[] = (adsetsData?.data ?? []).slice(0, 20);

  const spend = safeNum(insights?.spend);
  const roas = getPurchaseRoas(insights?.purchase_roas);
  const ctr = safeNum(insights?.ctr);
  const cpc = safeNum(insights?.cpc);
  const cpm = safeNum(insights?.cpm);
  const freq = safeNum(insights?.frequency);
  const impressions = safeNum(insights?.impressions);
  const reach = safeNum(insights?.reach);
  const purchases = getAction(insights?.actions, "offsite_conversion.fb_pixel_purchase") || getAction(insights?.actions, "purchase");
  const revenue = spend * roas;
  const cpa = purchases > 0 ? spend / purchases : 0;

  const kpis = [
    { label: "Total Spend", value: fmt(spend) },
    { label: "Revenue", value: fmt(revenue) },
    { label: "ROAS", value: `${roas.toFixed(2)}x` },
    { label: "CTR", value: `${ctr.toFixed(2)}%` },
    { label: "CPM", value: fmt(cpm) },
    { label: "CPC", value: fmt(cpc) },
    { label: "CPA", value: cpa > 0 ? fmt(cpa) : "—" },
    { label: "Frequency", value: freq.toFixed(2) },
    { label: "Reach", value: fmtNumber(reach) },
    { label: "Impressions", value: fmtNumber(impressions) },
    { label: "Purchases", value: fmtNumber(purchases) },
  ];

  const generatePdf = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;

      // ── Header ──
      doc.setFillColor(15, 15, 20);
      doc.rect(0, 0, pageW, 28, "F");
      doc.setTextColor(245, 166, 35);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("JOEX ADS", margin, 17);
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Performance Marketing Report", margin, 23);
      doc.setTextColor(140, 140, 140);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, pageW - margin - 48, 14, { align: "left" });
      doc.text(`Account: ${selectedAccountName || selectedAccountId}`, pageW - margin - 48, 20, { align: "left" });
      doc.text(`Period: ${since} → ${until}  |  Currency: ${currency}`, pageW - margin - 48, 26, { align: "left" });

      let y = 36;

      // ── KPI Summary ──
      doc.setTextColor(245, 166, 35);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Account KPIs", margin, y);
      y += 5;

      const kpiRows = [];
      for (let i = 0; i < kpis.length; i += 3) {
        kpiRows.push(kpis.slice(i, i + 3).flatMap((k) => [k.label, k.value]));
      }

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value", "Metric", "Value", "Metric", "Value"]],
        body: kpiRows,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, textColor: [220, 220, 220], fillColor: [22, 22, 30] },
        headStyles: { fillColor: [35, 35, 45], textColor: [180, 180, 180], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [28, 28, 38] },
        margin: { left: margin, right: margin },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // ── Campaigns ──
      if (campaigns.length > 0) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setTextColor(245, 166, 35);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Top Campaigns", margin, y);
        y += 5;

        autoTable(doc, {
          startY: y,
          head: [["Campaign", "Status", "Spend", "ROAS", "CTR", "CPC", "Freq"]],
          body: campaigns.map((c: any) => {
            const d = c.insights?.data?.[0] ?? {};
            const r = getPurchaseRoas(d.purchase_roas);
            return [
              c.name?.slice(0, 38) ?? "—",
              c.status ?? "—",
              fmt(safeNum(d.spend)),
              `${r.toFixed(2)}x`,
              `${safeNum(d.ctr).toFixed(2)}%`,
              fmt(safeNum(d.cpc)),
              safeNum(d.frequency).toFixed(2),
            ];
          }),
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2.5, textColor: [220, 220, 220], fillColor: [22, 22, 30] },
          headStyles: { fillColor: [35, 35, 45], textColor: [180, 180, 180], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [28, 28, 38] },
          columnStyles: { 0: { cellWidth: 60 } },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Ad Sets ──
      if (adsets.length > 0) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setTextColor(245, 166, 35);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Top Ad Sets", margin, y);
        y += 5;

        autoTable(doc, {
          startY: y,
          head: [["Ad Set", "Status", "Spend", "ROAS", "CTR", "CPC", "Freq"]],
          body: adsets.map((a: any) => {
            const d = a.insights?.data?.[0] ?? {};
            const r = getPurchaseRoas(d.purchase_roas);
            return [
              a.name?.slice(0, 38) ?? "—",
              a.status ?? "—",
              fmt(safeNum(d.spend)),
              `${r.toFixed(2)}x`,
              `${safeNum(d.ctr).toFixed(2)}%`,
              fmt(safeNum(d.cpc)),
              safeNum(d.frequency).toFixed(2),
            ];
          }),
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2.5, textColor: [220, 220, 220], fillColor: [22, 22, 30] },
          headStyles: { fillColor: [35, 35, 45], textColor: [180, 180, 180], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [28, 28, 38] },
          columnStyles: { 0: { cellWidth: 60 } },
          margin: { left: margin, right: margin },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Performance Summary ──
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(245, 166, 35);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Performance Summary", margin, y);
      y += 5;

      const summaryLines: string[] = [];
      if (roas >= 3) summaryLines.push(`• ROAS of ${roas.toFixed(2)}x is strong — account is profitable and scalable.`);
      else if (roas >= 1.5) summaryLines.push(`• ROAS of ${roas.toFixed(2)}x is acceptable. Look for opportunities to optimize CPA.`);
      else if (roas > 0) summaryLines.push(`• ROAS of ${roas.toFixed(2)}x is below target. Immediate optimization required.`);
      if (freq > 4) summaryLines.push(`• Frequency ${freq.toFixed(2)} is elevated — creative refresh recommended to prevent audience fatigue.`);
      if (ctr < 0.5) summaryLines.push(`• CTR of ${ctr.toFixed(2)}% is below benchmark — review creative hooks and audience targeting.`);
      if (cpa > 0) summaryLines.push(`• Average CPA is ${fmt(cpa)} — benchmark against your target CPA to assess profitability.`);
      const fatigued = campaigns.filter((c: any) => safeNum(c.insights?.data?.[0]?.frequency) > 5).length;
      if (fatigued > 0) summaryLines.push(`• ${fatigued} campaign(s) have frequency > 5 and require new creative assets.`);
      if (summaryLines.length === 0) summaryLines.push("• Account performance is within normal parameters. Continue monitoring KPIs weekly.");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 200);
      summaryLines.forEach((line) => {
        doc.text(line, margin, y);
        y += 6;
      });

      // ── Footer ──
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`JOEX Ads Intelligence Platform  |  Page ${i} of ${pageCount}`, pageW / 2, 290, { align: "center" });
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`joex-ads-report-${dateStr}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Reports
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate a full PDF executive performance report for the selected account and date range.
          </p>
        </div>
        <Button
          onClick={generatePdf}
          disabled={isLoading || generating}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
          ) : (
            <><Download className="h-4 w-4" />Download PDF</>
          )}
        </Button>
      </div>

      {/* Report preview */}
      <div className="grid grid-cols-1 gap-5">
        {/* KPI Cards */}
        <Card className="bg-card/40 border-card-border">
          <CardHeader>
            <CardTitle className="text-base">Account KPIs — Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {isLoading
                ? Array.from({ length: 11 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  ))
                : kpis.map((kpi) => (
                    <div key={kpi.label} className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
                      <div className="text-sm font-bold font-mono text-foreground">{kpi.value}</div>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>

        {/* Campaign preview */}
        <Card className="bg-card/40 border-card-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Campaign Performance
              <Badge variant="outline" className="text-xs">{campaigns.length} campaigns</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                : campaigns.slice(0, 8).map((c: any, i) => {
                    const d = c.insights?.data?.[0] ?? {};
                    const r = getPurchaseRoas(d.purchase_roas);
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 py-1.5 px-3 rounded-md bg-card/60 border border-border/40"
                      >
                        <Badge variant="outline" className={`text-[9px] shrink-0 ${c.status === "ACTIVE" ? "border-green-500 text-green-400" : "border-muted text-muted-foreground"}`}>
                          {c.status}
                        </Badge>
                        <span className="flex-1 text-xs font-medium line-clamp-1">{c.name}</span>
                        <span className="text-xs font-mono shrink-0">{fmt(safeNum(d.spend))}</span>
                        <span className={`text-xs font-mono shrink-0 ${r >= 2 ? "text-primary" : "text-muted-foreground"}`}>{r.toFixed(2)}x</span>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{safeNum(d.ctr).toFixed(2)}%</span>
                      </motion.div>
                    );
                  })}
            </div>
          </CardContent>
        </Card>

        {/* What's in the PDF */}
        <Card className="bg-card/40 border-card-border border-primary/20">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm mb-1">PDF Report includes:</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                  {[
                    "Full KPI summary table",
                    `Top ${campaigns.length} campaigns with metrics`,
                    `Top ${adsets.length} ad sets with metrics`,
                    "Performance analysis & commentary",
                    "Fatigue detection summary",
                    "Scaling opportunity flags",
                    `Currency: ${currency}`,
                    `Period: ${since} to ${until}`,
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
    </div>
  );
}
