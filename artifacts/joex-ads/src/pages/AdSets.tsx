import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdSets } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, getPurchaseRoas } from "@/lib/metaApi";

export default function AdSets() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useAdSets(selectedAccountId, since, until);
  const fmt = useFormatCurrency();
  const currency = useAccountCurrency();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<"spend" | "roas" | "ctr" | "cpc" | "frequency">("spend");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  if (!selectedAccountId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <LayoutDashboard className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Select an Ad Account</h3>
          <p className="text-muted-foreground text-sm max-w-xs">Choose an account to view ad set performance.</p>
        </div>
      </div>
    );
  }

  const rawAdsets: any[] = data?.data ?? [];
  const enriched = rawAdsets.map((a: any) => {
    const d = a.insights?.data?.[0] ?? {};
    return {
      ...a,
      _spend: safeNum(d.spend),
      _roas: getPurchaseRoas(d.purchase_roas),
      _ctr: safeNum(d.ctr),
      _cpc: safeNum(d.cpc),
      _frequency: safeNum(d.frequency),
    };
  });

  const filtered = enriched.filter((a: any) =>
    a.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const map: Record<string, string> = { spend: "_spend", roas: "_roas", ctr: "_ctr", cpc: "_cpc", frequency: "_frequency" };
    const diff = (b[map[sortCol]] ?? 0) - (a[map[sortCol]] ?? 0);
    return sortDir === "desc" ? diff : -diff;
  });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortHead = ({ col, label, align = "right" }: { col: typeof sortCol; label: string; align?: string }) => (
    <TableHead
      className={`text-${align} cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => toggleSort(col)}
    >
      {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </TableHead>
  );

  const exportCsv = () => {
    const headers = ["Name", "Status", "Spend", "ROAS", "CTR", "CPC", "Frequency"];
    const rows = sorted.map((a: any) => [
      `"${a.name}"`, a.status,
      a._spend.toFixed(2), a._roas.toFixed(2),
      `${a._ctr.toFixed(2)}%`, a._cpc.toFixed(2), a._frequency.toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adsets-${currency}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Ad Sets</h2>
          <p className="text-muted-foreground mt-1 text-sm">Detailed ad set performance — {currency}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ad sets..."
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
              <SortHead col="roas" label="ROAS" />
              <SortHead col="ctr" label="CTR" />
              <SortHead col="cpc" label="CPC" />
              <SortHead col="frequency" label="Freq" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-card-border">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No ad sets found for this account and date range.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((a: any) => (
                <TableRow key={a.id} className="border-card-border hover:bg-sidebar-accent/50 transition-colors">
                  <TableCell className="font-medium max-w-[200px] truncate">{a.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      a.status === "ACTIVE" ? "border-green-500 text-green-400"
                      : a.status === "PAUSED" ? "border-yellow-500 text-yellow-400"
                      : "border-muted text-muted-foreground"
                    }>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(a._spend)}</TableCell>
                  <TableCell className={`text-right font-mono ${a._roas >= 2 ? "text-primary" : a._roas > 0 ? "" : "text-muted-foreground"}`}>
                    {a._roas > 0 ? `${a._roas.toFixed(2)}x` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{a._ctr > 0 ? `${a._ctr.toFixed(2)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{a._cpc > 0 ? fmt(a._cpc) : "—"}</TableCell>
                  <TableCell className={`text-right font-mono ${a._frequency > 4 ? "text-yellow-400" : a._frequency > 5 ? "text-destructive" : ""}`}>
                    {a._frequency > 0 ? a._frequency.toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
