import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdAccounts, useMe } from "@/hooks/useMeta";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LogOut } from "lucide-react";
import { useLocation } from "wouter";

export function Topbar() {
  const { clearToken, isValidated } = useAuthStore();
  const { accounts, setAccounts, selectedAccountId, selectAccount } = useAccountStore();
  const { preset, setDateRange } = useDateStore();
  const [, setLocation] = useLocation();

  const { data: meData } = useMe(isValidated);
  const { data: accountsData } = useAdAccounts(isValidated);

  useEffect(() => {
    if (accountsData?.data) {
      setAccounts(accountsData.data);
      if (!selectedAccountId && accountsData.data.length > 0) {
        selectAccount(accountsData.data[0].id);
      }
    }
  }, [accountsData, selectedAccountId, selectAccount, setAccounts]);

  const handleLogout = () => {
    clearToken();
    setLocation("/");
  };

  return (
    <div className="h-16 flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <Select value={selectedAccountId || ""} onValueChange={selectAccount}>
          <SelectTrigger className="w-[280px] bg-background border-border">
            <SelectValue placeholder="Select Ad Account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name} ({acc.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={preset} onValueChange={(val) => {
          // Simplified date handling for now
          setDateRange("2024-01-01", "2024-01-31", val);
        }}>
          <SelectTrigger className="w-[180px] bg-background border-border">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Last 7 days">Last 7 days</SelectItem>
            <SelectItem value="Last 30 days">Last 30 days</SelectItem>
            <SelectItem value="This Month">This Month</SelectItem>
            <SelectItem value="Last Month">Last Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background px-3 py-1.5 rounded-full border border-border">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>{meData?.name || "Connected"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout} className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
          <LogOut className="h-4 w-4 mr-2" />
          Change Token
        </Button>
      </div>
    </div>
  );
}
