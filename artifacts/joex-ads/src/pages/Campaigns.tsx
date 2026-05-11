import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useCampaigns } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, getPurchaseRoas, getAction } from "@/lib/metaApi";

export default function Campaigns() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useCampaigns(selectedAccountId, since, until);
  const fmt = useFormatCurrency();
  const currency = useAccountCurrency();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"spend" | "roas" | "ctr" | "cpc" | "cpa">("spend");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  if (!selectedAccountId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <LayoutDashboard className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Choose an account to view campaign performance.</p>
        </div>
      </div>
    );
  }

  const rawCampaigns: any[] = data?.data ?? [];

  const enriched = rawCampaigns.map((c: any) => {
    const d = c.insights?.data?.[0] ?? {};
    const spend = safeNum(d.spend);
    const roas = getPurchaseRoas(d.purchase_roas);
    const ctr = safeNum(d.ctr);
    const cpc = safeNum(d.cpc);
    const purchases = getAction(d.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d.actions, "purchase");
    const cpa = purchases > 0 ? spend / purchases : 0;
    return { ...c, _spend: spend, _roas: roas, _ctr: ctr, _cpc: cpc, _cpa: cpa, _purchases: purchases };
  });

  const filtered = enriched.filter((c: any) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const map: Record<string, string> = { spend: "_spend", roas: "_roas", ctr: "_ctr", cpc: "_cpc", cpa: "_cpa" };
    const key = map[sortCol];
    const diff = (b[key] ?? 0) - (a[key] ?? 0);
    return sortDir === "desc" ? diff : -diff;
  });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortHead = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <TableHead
      className="text-right cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </TableHead>
  );

  const exportCsv = () => {
    const headers = ["Name", "Status", "Spend", "Revenue", "ROAS", "CTR", "CPC", "CPA", "Purchases"];
    const rows = sorted.map((c: any) => [
      `"${c.name}"`, c.status,
      c._spend.toFixed(2), (c._spend * c._roas).toFixed(2),
      c._roas.toFixed(2), `${c._ctr.toFixed(2)}%`,
      c._cpc.toFixed(2), c._cpa > 0 ? c._cpa.toFixed(2) : "0",
      c._purchases,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaigns-${currency}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h2>
          <p className="text-muted-foreground mt-1 text-sm">Detailed campaign performance — {currency}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[240px] bg-card border-card-border"
            />
          </div>
          <Button variant="outline" onClick={exportCsv} className="border-card-border hover:bg-sidebar-accent" disabled={sorted.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-md border border-card-border bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        <Table>
          <TableHeader className="bg-card/80">
            <TableRow className="border-card-border hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <SortHead col="spend" label="Spend" />
              <TableHead className="text-right">Revenue</TableHead>
              <SortHead col="roas" label="ROAS" />
              <SortHead col="ctr" label="CTR" />
              <SortHead col="cpc" label="CPC" />
              <SortHead col="cpa" label="CPA" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-card-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No campaigns found.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((c: any) => {
                const revenue = c._spend * c._roas;
                return (
                  <TableRow key={c.id} className="border-card-border hover:bg-sidebar-accent/50 transition-colors">
                    <TableCell className="font-medium max-w-[220px] truncate">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        c.status === "ACTIVE" ? "border-green-500 text-green-400"
                        : c.status === "PAUSED" ? "border-yellow-500 text-yellow-400"
                        : "border-muted text-muted-foreground"
                      }>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(c._spend)}</TableCell>
                    <TableCell className="text-right font-mono">{revenue > 0 ? fmt(revenue) : "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${c._roas >= 2 ? "text-primary" : c._roas > 0 ? "" : "text-muted-foreground"}`}>
                      {c._roas > 0 ? `${c._roas.toFixed(2)}x` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{c._ctr > 0 ? `${c._ctr.toFixed(2)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{c._cpc > 0 ? fmt(c._cpc) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{c._cpa > 0 ? fmt(c._cpa) : "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
