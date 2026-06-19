import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdAccounts, useMe } from "@/hooks/useMeta";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/DateRangePicker";
import { CheckCircle2, LogOut, CalendarIcon, Bug, Menu, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TopbarProps {
  onToggleDebug?: () => void;
  debugOpen?: boolean;
  onMenuClick?: () => void;
}

export function Topbar({ onToggleDebug, debugOpen, onMenuClick }: TopbarProps) {
  const { clearToken, isValidated } = useAuthStore();
  const { accounts, setAccounts, selectedAccountId, selectAccount } = useAccountStore();
  const { since, until, preset, setDateRange } = useDateStore();
  const [, setLocation] = useLocation();

  const [pickerOpen, setPickerOpen] = useState(false);

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

  const handleApply = (s: string, u: string, p: string) => {
    setDateRange(s, u, p);
    setPickerOpen(false);
  };

  // Label shown on the date trigger button
  const triggerLabel =
    preset === "Custom"
      ? (() => {
          try {
            return `${format(new Date(since), "MMM d")} — ${format(new Date(until), "MMM d, yyyy")}`;
          } catch {
            return "Custom Range";
          }
        })()
      : preset;

  return (
    <>
      {/* Date Range Picker — rendered at root level so it can animate freely */}
      <DateRangePicker
        open={pickerOpen}
        currentSince={since}
        currentUntil={until}
        currentPreset={preset}
        onApply={handleApply}
        onClose={() => setPickerOpen(false)}
      />

      <div className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">

        {/* ── Main row ────────────────────────────────────────────────── */}
        <div className="h-14 px-3 md:px-4 flex items-center gap-2 md:gap-3">

          {/* Hamburger — mobile only */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* ── Left controls (desktop) ─────────────────────────────── */}
          <div className="hidden sm:flex items-center gap-2 flex-1 min-w-0">

            {/* Account selector */}
            <Select value={selectedAccountId || ""} onValueChange={selectAccount}>
              <SelectTrigger
                className="w-[180px] lg:w-[240px] bg-background border-border text-sm"
                data-testid="select-account"
              >
                <SelectValue placeholder="Select Ad Account" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id} data-testid={`account-option-${acc.id}`}>
                    <span className="font-medium">{acc.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs">({acc.currency})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range trigger — always opens picker, always works */}
            <button
              onClick={() => setPickerOpen(true)}
              data-testid="select-date-preset"
              className={cn(
                "h-9 flex items-center gap-2 px-3 rounded-lg border text-sm transition-all duration-150",
                "bg-background border-border text-foreground",
                "hover:border-primary/40 hover:bg-primary/5",
                pickerOpen && "border-primary/50 bg-primary/8 text-primary",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="max-w-[190px] truncate font-medium">{triggerLabel}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150",
                  pickerOpen && "rotate-180",
                )}
              />
            </button>
          </div>

          {/* Spacer — mobile */}
          <div className="flex-1 sm:hidden" />

          {/* ── Right controls ──────────────────────────────────────── */}
          <div className="flex items-center gap-1 md:gap-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-background px-2 md:px-3 py-1.5 rounded-full border border-border">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
              <span className="hidden md:block truncate max-w-[100px] lg:max-w-[140px] text-xs">
                {meData?.name || "Connected"}
              </span>
            </div>

            {onToggleDebug && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleDebug}
                className={cn("h-8 w-8 hidden md:flex", debugOpen && "text-primary")}
                title="Toggle debug panel"
                data-testid="btn-debug"
              >
                <Bug className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => { clearToken(); setLocation("/"); }}
              className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors px-2 md:px-3"
              data-testid="btn-change-token"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline ml-1.5">Token</span>
            </Button>
          </div>
        </div>

        {/* ── Mobile second row ──────────────────────────────────────── */}
        <div className="sm:hidden px-3 pb-2.5 flex gap-2">
          <Select value={selectedAccountId || ""} onValueChange={selectAccount}>
            <SelectTrigger
              className="flex-1 min-w-0 bg-background border-border text-xs h-9"
              data-testid="select-account-mobile"
            >
              <SelectValue placeholder="Select Ad Account" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <span className="font-medium">{acc.name}</span>
                  <span className="ml-1.5 text-muted-foreground text-xs">({acc.currency})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mobile date trigger */}
          <button
            onClick={() => setPickerOpen(true)}
            className={cn(
              "h-9 flex items-center gap-1.5 px-3 rounded-lg border text-xs transition-all duration-150 flex-shrink-0 max-w-[140px]",
              "bg-background border-border text-foreground",
              "hover:border-primary/40",
              pickerOpen && "border-primary/50 text-primary",
            )}
          >
            <CalendarIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate font-medium">
              {preset === "Custom" ? "Custom" : preset}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-auto" />
          </button>
        </div>
      </div>
    </>
  );
}
