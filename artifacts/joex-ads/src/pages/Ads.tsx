import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAds } from "@/hooks/useMeta";
import { useFormatCurrency, useAccountCurrency } from "@/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, Image as ImageIcon, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, getPurchaseRoas, getAction } from "@/lib/metaApi";

export default function Ads() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useAds(selectedAccountId, since, until);
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
          <p className="text-muted-foreground text-sm max-w-xs">Choose an account to view ad performance.</p>
        </div>
      </div>
    );
  }

  const rawAds: any[] = data?.data ?? [];
  const enriched = rawAds.map((a: any) => {
    const d = a.insights?.data?.[0] ?? {};
    const spend = safeNum(d.spend);
    const roas = getPurchaseRoas(d.purchase_roas);
    const purchases = getAction(d.actions, "offsite_conversion.fb_pixel_purchase") || getAction(d.actions, "purchase");
    return {
      ...a,
      _spend: spend,
      _roas: roas,
      _ctr: safeNum(d.ctr),
      _cpc: safeNum(d.cpc),
      _frequency: safeNum(d.frequency),
      _cpa: purchases > 0 ? spend / purchases : 0,
      _purchases: purchases,
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

  const SortHead = ({ col, label }: { col: typeof sortCol; label: string }) => (
    <TableHead
      className="text-right cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </TableHead>
  );

  const exportCsv = () => {
    const headers = ["Name", "Status", "Spend", "ROAS", "CTR", "CPC", "Frequency", "CPA", "Purchases"];
    const rows = sorted.map((a: any) => [
      `"${a.name}"`, a.status,
      a._spend.toFixed(2), a._roas.toFixed(2),
      `${a._ctr.toFixed(2)}%`, a._cpc.toFixed(2),
      a._frequency.toFixed(2), a._cpa > 0 ? a._cpa.toFixed(2) : "0",
      a._purchases,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ads-${currency}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Ads</h2>
          <p className="text-muted-foreground mt-1 text-sm">Ad creative performance metrics — {currency}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ads..."
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
              <TableHead>Ad &amp; Creative</TableHead>
              <TableHead>Status</TableHead>
              <SortHead col="spend" label="Spend" />
              <SortHead col="roas" label="ROAS" />
              <SortHead col="ctr" label="CTR" />
              <SortHead col="cpc" label="CPC" />
              <SortHead col="frequency" label="Freq" />
              <TableHead className="text-right">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-card-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No ads found for this account and date range.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((ad: any) => {
                const creativeUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
                return (
                  <TableRow key={ad.id} className="border-card-border hover:bg-sidebar-accent/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {creativeUrl ? (
                          <div className="h-10 w-10 rounded-md border border-border overflow-hidden flex-shrink-0 bg-muted">
                            <img src={creativeUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 bg-muted rounded-md border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <span className="font-medium line-clamp-1 max-w-[180px] text-sm">{ad.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        ad.status === "ACTIVE" ? "border-green-500 text-green-400"
                        : ad.status === "PAUSED" ? "border-yellow-500 text-yellow-400"
                        : "border-muted text-muted-foreground"
                      }>
                        {ad.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(ad._spend)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${ad._roas >= 2 ? "text-primary" : ad._roas > 0 ? "" : "text-muted-foreground"}`}>
                      {ad._roas > 0 ? `${ad._roas.toFixed(2)}x` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{ad._ctr > 0 ? `${ad._ctr.toFixed(2)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{ad._cpc > 0 ? fmt(ad._cpc) : "—"}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${ad._frequency > 4 ? "text-yellow-400" : ""}`}>
                      {ad._frequency > 0 ? ad._frequency.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {ad._cpa > 0 ? fmt(ad._cpa) : "—"}
                    </TableCell>
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
