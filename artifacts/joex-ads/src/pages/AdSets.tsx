import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdSets } from "@/hooks/useMeta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, LayoutDashboard } from "lucide-react";
import { motion } from "framer-motion";
import { safeNum, getPurchaseRoas } from "@/lib/metaApi";

function exportCsv(rows: any[]) {
  const headers = ["Name", "Status", "Spend", "ROAS", "CTR", "CPC", "Frequency"];
  const lines = rows.map((adset: any) => {
    const d = adset.insights?.data?.[0] ?? {};
    return [
      `"${adset.name}"`,
      adset.status,
      safeNum(d.spend).toFixed(2),
      getPurchaseRoas(d.purchase_roas).toFixed(2),
      safeNum(d.ctr).toFixed(2),
      safeNum(d.cpc).toFixed(2),
      safeNum(d.frequency).toFixed(2),
    ].join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "adsets.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function AdSets() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useAdSets(selectedAccountId, since, until);
  const [search, setSearch] = useState("");

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

  const adsets = data?.data ?? [];
  const filtered = adsets.filter((c: any) => c.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Ad Sets</h2>
          <p className="text-muted-foreground mt-1 text-sm">Detailed ad set performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ad sets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[250px] bg-card border-card-border"
              data-testid="input-search-adsets"
            />
          </div>
          <Button
            variant="outline"
            className="border-card-border hover:bg-sidebar-accent"
            onClick={() => exportCsv(filtered)}
            data-testid="btn-export-adsets"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-md border border-card-border bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        <Table>
          <TableHeader className="bg-card/80">
            <TableRow className="border-card-border hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">Frequency</TableHead>
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No ad sets found for this account and date range.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((adset: any) => {
                const insight = adset.insights?.data?.[0] ?? {};
                const roas = getPurchaseRoas(insight.purchase_roas);
                return (
                  <TableRow
                    key={adset.id}
                    className="border-card-border hover:bg-sidebar-accent/50 transition-colors"
                    data-testid={`row-adset-${adset.id}`}
                  >
                    <TableCell className="font-medium max-w-[200px] truncate">{adset.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          adset.status === "ACTIVE"
                            ? "border-green-500 text-green-500"
                            : adset.status === "PAUSED"
                            ? "border-yellow-500 text-yellow-500"
                            : "border-gray-500 text-gray-500"
                        }
                      >
                        {adset.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">${safeNum(insight.spend).toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-mono ${roas > 2 ? "text-primary" : ""}`}>
                      {roas.toFixed(2)}x
                    </TableCell>
                    <TableCell className="text-right font-mono">{safeNum(insight.ctr).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-mono">${safeNum(insight.cpc).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{safeNum(insight.frequency).toFixed(2)}</TableCell>
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
