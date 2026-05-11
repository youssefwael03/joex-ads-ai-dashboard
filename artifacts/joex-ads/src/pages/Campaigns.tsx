import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useCampaigns } from "@/hooks/useMeta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function Campaigns() {
  const { selectedAccountId } = useAccountStore();
  const { since, until } = useDateStore();
  const { data, isLoading } = useCampaigns(selectedAccountId, since, until);
  const [search, setSearch] = useState("");

  const campaigns = data?.data || [];
  
  const filtered = campaigns.filter((c: any) => 
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCsv = () => {
    const headers = ["Name", "Status", "Spend", "ROAS", "CTR", "CPC"];
    const rows = filtered.map((c: any) => [
      c.name,
      c.status,
      c.insights?.data?.[0]?.spend || "0",
      c.insights?.data?.[0]?.purchase_roas?.[0]?.value || "0",
      c.insights?.data?.[0]?.ctr || "0",
      c.insights?.data?.[0]?.cpc || "0",
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "campaigns.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Campaigns</h2>
          <p className="text-muted-foreground mt-1">Detailed campaign performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search campaigns..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[250px] bg-card border-card-border"
            />
          </div>
          <Button variant="outline" onClick={exportCsv} className="border-card-border hover:bg-sidebar-accent">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-card-border">
                  <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No campaigns found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((campaign: any) => {
                const insight = campaign.insights?.data?.[0] || {};
                return (
                  <TableRow key={campaign.id} className="border-card-border hover:bg-sidebar-accent/50 transition-colors">
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        campaign.status === 'ACTIVE' ? 'border-green-500 text-green-500' : 
                        campaign.status === 'PAUSED' ? 'border-yellow-500 text-yellow-500' : 'border-gray-500 text-gray-500'
                      }>
                        {campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">${Number(insight.spend || 0).toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-mono ${Number(insight.purchase_roas?.[0]?.value || 0) > 2 ? 'text-primary' : ''}`}>
                      {Number(insight.purchase_roas?.[0]?.value || 0).toFixed(2)}x
                    </TableCell>
                    <TableCell className="text-right font-mono">{Number(insight.ctr || 0).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-mono">${Number(insight.cpc || 0).toFixed(2)}</TableCell>
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
