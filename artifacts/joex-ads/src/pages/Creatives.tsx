import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { useAds } from "@/hooks/useMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Image as ImageIcon, PlayCircle } from "lucide-react";

export default function Creatives() {
  const { selectedAccountId } = useAccountStore();
  const { data, isLoading } = useAds(selectedAccountId);

  const ads = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Creative Intelligence</h2>
        <p className="text-muted-foreground mt-1">Visual performance gallery.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center text-muted-foreground py-20">No creatives found for this account.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {ads.map((ad: any) => {
            const insight = ad.insights?.data?.[0] || {};
            const creativeUrl = ad.creative?.thumbnail_url || ad.creative?.image_url;
            return (
              <Card key={ad.id} className="bg-card/40 border-card-border overflow-hidden group">
                <div className="aspect-square bg-muted relative flex items-center justify-center">
                  {creativeUrl ? (
                    <img src={creativeUrl} alt={ad.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  )}
                  {ad.creative?.thumbnail_url && (
                    <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-full text-white">
                      <PlayCircle className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <h4 className="font-medium text-sm line-clamp-1 mb-2">{ad.name}</h4>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">ROAS</span>
                    <span className={`font-mono font-medium ${Number(insight.purchase_roas?.[0]?.value || 0) > 2 ? 'text-primary' : ''}`}>
                      {Number(insight.purchase_roas?.[0]?.value || 0).toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-muted-foreground">Spend</span>
                    <span className="font-mono">${Number(insight.spend || 0).toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
