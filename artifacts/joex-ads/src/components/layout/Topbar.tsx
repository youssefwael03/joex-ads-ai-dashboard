import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdAccounts, useMe } from "@/hooks/useMeta";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, LogOut, CalendarIcon, Bug, Menu } from "lucide-react";
import { useLocation } from "wouter";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfWeek,
  endOfWeek,
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
    label: "Today & Yesterday",
    since: () => format(subDays(new Date(), 1), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 7 Days",
    since: () => format(subDays(new Date(), 6), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 14 Days",
    since: () => format(subDays(new Date(), 13), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 28 Days",
    since: () => format(subDays(new Date(), 27), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last 30 Days",
    since: () => format(subDays(new Date(), 29), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "This Week",
    since: () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Last Week",
    since: () => format(startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    until: () => format(endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), "yyyy-MM-dd"),
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
    since: () => "2020-01-01",
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
];

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
    if (label === "Custom") {
      setCalOpen(true);
      return;
    }
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

  const allSelectItems = [...PRESETS.map((p) => p.label), "Custom"];

  return (
    <div className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="h-14 px-3 md:px-4 flex items-center gap-2 md:gap-3">

        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* ── Left controls (desktop/tablet) ──────────────────────────── */}
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

          {/* Date preset selector — all 13 options */}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <Select value={preset} onValueChange={handlePreset}>
              <SelectTrigger
                className="w-[150px] lg:w-[185px] bg-background border-border text-sm"
                data-testid="select-date-preset"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground mr-1 flex-shrink-0" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {allSelectItems.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Calendar popover — triggered when Custom is selected */}
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

          {/* Active date display — desktop only */}
          <span className="text-xs text-muted-foreground hidden xl:block font-mono bg-background border border-border px-2 py-1 rounded whitespace-nowrap">
            {since} → {until}
          </span>
        </div>

        {/* Spacer — on mobile, push right controls to end */}
        <div className="flex-1 sm:hidden" />

        {/* ── Right controls ───────────────────────────────────────────── */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* User badge */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-background px-2 md:px-3 py-1.5 rounded-full border border-border">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            <span className="hidden md:block truncate max-w-[100px] lg:max-w-[140px] text-xs">
              {meData?.name || "Connected"}
            </span>
          </div>

          {/* Debug toggle — hidden on mobile */}
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

          {/* Logout */}
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

      {/* ── Mobile second row — account + date ────────────────────────────── */}
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

        {/* Mobile date selector */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <Select value={preset} onValueChange={handlePreset}>
            <SelectTrigger className="w-[130px] bg-background border-border text-xs h-9">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              {allSelectItems.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
            <Calendar
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              numberOfMonths={1}
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
      </div>
    </div>
  );
}
