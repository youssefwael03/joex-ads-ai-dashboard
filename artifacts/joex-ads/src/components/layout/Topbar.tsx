import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAccountStore } from "@/store/accountStore";
import { useDateStore } from "@/store/dateStore";
import { useAdAccounts, useMe } from "@/hooks/useMeta";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

// Meta API hard limit: 37 months back from today (use 36 to be safe)
const META_EARLIEST = subMonths(new Date(), 36);

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
    label: "Last 90 Days",
    since: () => format(subDays(new Date(), 89), "yyyy-MM-dd"),
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
    since: () => format(META_EARLIEST, "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
];

const ALL_ITEMS = [...PRESETS.map((p) => p.label), "Custom"];

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

  // Custom date dialog
  const [dialogOpen, setDialogOpen] = useState(false);
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
      // Seed the calendar with the current range so it opens on the right month
      setCalRange({ from: new Date(since), to: new Date(until) });
      setDialogOpen(true);
      return;
    }
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    setDateRange(p.since(), p.until(), label);
  };

  const applyCustomRange = () => {
    if (calRange?.from && calRange?.to) {
      setDateRange(
        format(calRange.from, "yyyy-MM-dd"),
        format(calRange.to, "yyyy-MM-dd"),
        "Custom",
      );
      setDialogOpen(false);
    }
  };

  // Select display value — show "Custom (since → until)" when active
  const selectValue = preset === "Custom" ? "Custom" : preset;

  return (
    <div className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">

      {/* ── Custom date range dialog ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border p-0 w-auto max-w-fit">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <CalendarIcon className="h-4 w-4 text-primary" />
              Custom Date Range
            </DialogTitle>
          </DialogHeader>
          <div className="p-2">
            <Calendar
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              numberOfMonths={2}
              defaultMonth={calRange?.from ?? new Date(since)}
              fromMonth={META_EARLIEST}
              toDate={new Date()}
              className="rounded-md"
            />
          </div>
          <DialogFooter className="px-5 pb-5 pt-3 border-t border-border gap-2">
            <div className="text-xs text-muted-foreground flex-1">
              {calRange?.from && calRange?.to
                ? `${format(calRange.from, "MMM d, yyyy")} → ${format(calRange.to, "MMM d, yyyy")}`
                : calRange?.from
                ? `${format(calRange.from, "MMM d, yyyy")} → pick end date`
                : "Pick a start date"}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={applyCustomRange}
              disabled={!calRange?.from || !calRange?.to}
              className="bg-primary text-black hover:bg-primary/90"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

        {/* ── Left controls (desktop) ──────────────────────────────────── */}
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

          {/* Date preset selector */}
          <Select value={selectValue} onValueChange={handlePreset}>
            <SelectTrigger
              className="w-[155px] lg:w-[190px] bg-background border-border text-sm"
              data-testid="select-date-preset"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground mr-1 flex-shrink-0" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {ALL_ITEMS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Active date display */}
          <span className="text-xs text-muted-foreground hidden xl:block font-mono bg-background border border-border px-2 py-1 rounded whitespace-nowrap">
            {since} → {until}
          </span>
        </div>

        {/* Spacer — mobile */}
        <div className="flex-1 sm:hidden" />

        {/* ── Right controls ───────────────────────────────────────────── */}
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

      {/* ── Mobile second row ─────────────────────────────────────────────── */}
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

        <Select value={selectValue} onValueChange={handlePreset}>
          <SelectTrigger className="w-[130px] bg-background border-border text-xs h-9">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            {ALL_ITEMS.map((label) => (
              <SelectItem key={label} value={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
