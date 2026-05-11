import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAuthStore } from "@/store/authStore";
import { useInsights } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bug, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DebugPanelProps {
  onClose: () => void;
}

export function DebugPanel({ onClose }: DebugPanelProps) {
  const { selectedAccountId, selectedAccountName, selectedAccountCurrency, accounts } = useAccountStore();
  const { since, until, preset } = useDateStore();
  const { token } = useAuthStore();
  const { data: insights, isLoading, error } = useInsights(selectedAccountId, since, until);

  const rows = [
    { label: "Token (first 20 chars)", value: token ? `${token.slice(0, 20)}…` : "none" },
    { label: "Selected Account ID", value: selectedAccountId || "none" },
    { label: "Selected Account Name", value: selectedAccountName || "none" },
    { label: "Currency", value: selectedAccountCurrency },
    { label: "Total accounts loaded", value: String(accounts.length) },
    { label: "Date Preset", value: preset },
    { label: "Since", value: since },
    { label: "Until", value: until },
    { label: "Insights loading", value: isLoading ? "true" : "false" },
    { label: "Insights error", value: error ? String((error as Error).message) : "none" },
    { label: "Insights data[0] spend", value: insights?.data?.[0]?.spend ?? "N/A" },
    { label: "Insights data[0] ROAS", value: JSON.stringify(insights?.data?.[0]?.purchase_roas ?? "N/A") },
    { label: "Insights records", value: String(insights?.data?.length ?? 0) },
  ];

  return (
    <div className="fixed bottom-0 right-0 w-[420px] max-h-[50vh] z-50 shadow-2xl">
      <Card className="bg-card/95 backdrop-blur-xl border-primary/30 rounded-b-none h-full flex flex-col">
        <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0">
          <CardTitle className="text-sm flex items-center gap-2 text-primary">
            <Bug className="h-4 w-4" />
            Debug Panel
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden pb-3">
          <ScrollArea className="h-full">
            <div className="space-y-1.5 pr-3">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] max-w-[200px] truncate border-border ${
                      value === "none" || value === "false" || value === "0"
                        ? "text-muted-foreground"
                        : value === "true" || value.startsWith("act_")
                        ? "text-primary border-primary/30"
                        : "text-foreground"
                    }`}
                    title={String(value)}
                  >
                    {String(value)}
                  </Badge>
                </div>
              ))}
              {insights?.data?.[0] && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground mb-1">Raw insights[0]:</div>
                  <pre className="text-[10px] font-mono bg-background/60 rounded p-2 overflow-x-auto text-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(insights.data[0], null, 2)}
                  </pre>
                </div>
              )}
              {insights?.error && (
                <div className="mt-3">
                  <div className="text-xs text-destructive mb-1">Meta API error:</div>
                  <pre className="text-[10px] font-mono bg-destructive/10 rounded p-2 text-destructive whitespace-pre-wrap">
                    {JSON.stringify(insights.error, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
