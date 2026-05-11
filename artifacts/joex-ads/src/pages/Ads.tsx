import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useAds } from "@/hooks/useMeta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";

export default function Ads() {
  const { selectedAccountId } = useAccountStore();
  const { data, isLoading } = useAds(selectedAccountId);
  const [search, setSearch] = useState("");

  const ads = data?.data || [];
  
  const filtered = ads.filter((c: any) => 
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Ads</h2>
          <p className="text-muted-foreground mt-1">Detailed ad creative performance metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search ads..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[250px] bg-card border-card-border"
            />
          </div>
          <Button variant="outline" className="border-card-border hover:bg-sidebar-accent">
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
              <TableHead>Ad & Creative</TableHead>
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
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-md" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </TableCell>
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
                  No ads found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((ad: any) => {
                const insight = ad.insights?.data?.[0] || {};
                const creativeUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
                
                return (
                  <TableRow key={ad.id} className="border-card-border hover:bg-sidebar-accent/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {creativeUrl ? (
                          <div className="h-10 w-10 bg-muted rounded-md border border-border overflow-hidden flex-shrink-0">
                            <img src={creativeUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 bg-muted rounded-md border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                        <span className="font-medium line-clamp-1">{ad.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        ad.status === 'ACTIVE' ? 'border-green-500 text-green-500' : 
                        ad.status === 'PAUSED' ? 'border-yellow-500 text-yellow-500' : 'border-gray-500 text-gray-500'
                      }>
                        {ad.status}
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
