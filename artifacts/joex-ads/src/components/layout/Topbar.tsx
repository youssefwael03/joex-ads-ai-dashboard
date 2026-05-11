import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdAccounts, useMe } from "@/hooks/useMeta";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, LogOut, CalendarIcon, Bug } from "lucide-react";
import { useLocation } from "wouter";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const PRESETS: { label: string; since: () => string; until: () => string }[] = [
  {
    label: "Today",
    since: () => format(new Date(), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Yesterday",
    since: () => format(subDays(new Date(), 1), "yyyy-MM-dd"),
    until: () => format(subDays(new Date(), 1), "yyyy-MM-dd"),
  },
  {
    label: "Last 7 Days",
    since: () => format(subDays(new Date(), 6), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 30 Days",
    since: () => format(subDays(new Date(), 29), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "This Month",
    since: () => format(startOfMonth(new Date()), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last Month",
    since: () => format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    until: () => format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
  },
  {
    label: "Maximum",
    since: () => format(startOfYear(subMonths(new Date(), 24)), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
];

interface TopbarProps {
  onToggleDebug?: () => void;
  debugOpen?: boolean;
}

export function Topbar({ onToggleDebug, debugOpen }: TopbarProps) {
  const { clearToken, isValidated } = useAuthStore();
  const { accounts, setAccounts, selectedAccountId, selectAccount } = useAccountStore();
  const { since, until, preset, setDateRange } = useDateStore();
  const [, setLocation] = useLocation();
  const [calOpen, setCalOpen] = useState(false);
  const [calRange, setCalRange] = useState<DateRange | undefined>({
    from: new Date(since),
    to: new Date(until),
  });

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

  const handlePreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    setDateRange(p.since(), p.until(), label);
  };

  const applyCustomRange = () => {
    if (calRange?.from && calRange?.to) {
      const s = format(calRange.from, "yyyy-MM-dd");
      const u = format(calRange.to, "yyyy-MM-dd");
      setDateRange(s, u, "Custom");
      setCalOpen(false);
    }
  };

  return (
    <div className="h-16 flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Account selector */}
        <Select value={selectedAccountId || ""} onValueChange={selectAccount}>
          <SelectTrigger className="w-[240px] bg-background border-border" data-testid="select-account">
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

        {/* Date preset selector */}
        <Select value={preset} onValueChange={handlePreset}>
          <SelectTrigger className="w-[150px] bg-background border-border" data-testid="select-date-preset">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Custom calendar popover */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "border-border bg-background font-normal gap-2",
                preset === "Custom" && "border-primary/60 text-primary"
              )}
              data-testid="btn-custom-date"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {preset === "Custom" ? `${since} → ${until}` : "Custom"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
            <Calendar
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              numberOfMonths={2}
              defaultMonth={new Date(since)}
              className="rounded-md"
            />
            <div className="flex justify-end gap-2 p-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setCalOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={applyCustomRange} disabled={!calRange?.from || !calRange?.to}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Active date display */}
        <span className="text-xs text-muted-foreground hidden lg:block font-mono bg-background border border-border px-2 py-1 rounded">
          {since} → {until}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background px-3 py-1.5 rounded-full border border-border">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span className="hidden sm:block truncate max-w-[120px]">{meData?.name || "Connected"}</span>
        </div>
        {onToggleDebug && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleDebug}
            className={cn("h-8 w-8", debugOpen && "text-primary")}
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
          className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
          data-testid="btn-change-token"
        >
          <LogOut className="h-4 w-4 mr-1.5" />
          Change Token
        </Button>
      </div>
    </div>
  );
}
