import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { format, subDays, subMonths, differenceInCalendarDays, isToday } from "date-fns";
import { X, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, META_EARLIEST, PRESET_LABEL_SET } from "@/lib/datePresets";
import type { Preset } from "@/lib/datePresets";

// ─── Props ────────────────────────────────────────────────────────────────────
interface DateRangePickerProps {
  open: boolean;
  currentSince: string;
  currentUntil: string;
  currentPreset: string;
  onApply: (since: string, until: string, preset: string) => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dayCount(since: string, until: string): string {
  try {
    const n = differenceInCalendarDays(new Date(until), new Date(since)) + 1;
    return n === 1 ? "1 day" : `${n} days`;
  } catch {
    return "";
  }
}

function fmtDisplay(d: string) {
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DateRangePicker({
  open,
  currentSince,
  currentUntil,
  currentPreset,
  onApply,
  onClose,
}: DateRangePickerProps) {
  const today = new Date();

  const [selectedPreset, setSelectedPreset] = useState<string>(currentPreset);
  const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);
  const [leftMonth, setLeftMonth] = useState<Date>(subMonths(today, 1));

  // Reset every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setSelectedPreset(currentPreset);
    try {
      setCalRange({ from: new Date(currentSince), to: new Date(currentUntil) });
    } catch {
      setCalRange({ from: subDays(today, 6), to: today });
    }
    // Always show: previous month (left) + current month (right)
    setLeftMonth(subMonths(today, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const displaySince = calRange?.from ? format(calRange.from, "yyyy-MM-dd") : currentSince;
  const displayUntil = calRange?.to   ? format(calRange.to,   "yyyy-MM-dd") : currentUntil;

  const handlePresetClick = (p: Preset) => {
    setSelectedPreset(p.label);
    const s = p.since();
    const u = p.until();
    setCalRange({ from: new Date(s), to: new Date(u) });
    try {
      const start = new Date(s);
      const end   = new Date(u);
      const days  = differenceInCalendarDays(end, start);
      setLeftMonth(days > 60 ? subMonths(end, 1) : start);
    } catch { /* ignore */ }
  };

  const handleCalSelect = (range: DateRange | undefined) => {
    setCalRange(range);
    setSelectedPreset("Custom");
  };

  const handleApply = () => {
    if (!calRange?.from) return;
    const s = format(calRange.from, "yyyy-MM-dd");
    const u = calRange.to ? format(calRange.to, "yyyy-MM-dd") : s;
    const label = PRESET_LABEL_SET.has(selectedPreset) ? selectedPreset : "Custom";
    onApply(s, u, label);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────── */}
          <motion.div
            key="drp-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* ── Panel ────────────────────────────────────────────────── */}
          <motion.div
            key="drp-panel"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                       w-[96vw] max-w-[860px] rounded-2xl
                       border border-white/10
                       bg-[#0f1014]
                       shadow-[0_32px_80px_rgba(0,0,0,0.75)]
                       flex flex-col overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 48px)" }}
            onClick={(e) => e.stopPropagation()}
          >

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <CalendarRange className="h-[18px] w-[18px] text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">Date Range</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtDisplay(displaySince)}
                    <span className="mx-1.5 text-white/25">→</span>
                    {fmtDisplay(displayUntil)}
                    {displaySince && displayUntil && (
                      <span className="ml-2 text-primary/70 font-medium">
                        {dayCount(displaySince, displayUntil)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* Left: preset list (desktop only) */}
              <div
                className="hidden sm:flex flex-col w-44 flex-shrink-0 border-r border-white/[0.07] overflow-y-auto py-2"
                style={{ scrollbarWidth: "none" }}
              >
                <p className="px-4 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                  Quick Select
                </p>
                {DATE_PRESETS.map((p) => {
                  const active = selectedPreset === p.label;
                  return (
                    <button
                      key={p.label}
                      onClick={() => handlePresetClick(p)}
                      className={cn(
                        "relative w-full text-left px-4 py-[7px] text-xs transition-all duration-100",
                        active
                          ? "text-primary font-semibold bg-primary/8"
                          : "text-white/55 hover:text-white hover:bg-white/5",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] bg-primary rounded-r-full" />
                      )}
                      {p.label}
                    </button>
                  );
                })}
                <div className="mx-4 my-2 border-t border-white/[0.07]" />
                <button
                  onClick={() => setSelectedPreset("Custom")}
                  className={cn(
                    "relative w-full text-left px-4 py-[7px] text-xs transition-all duration-100",
                    selectedPreset === "Custom"
                      ? "text-primary font-semibold bg-primary/8"
                      : "text-white/55 hover:text-white hover:bg-white/5",
                  )}
                >
                  {selectedPreset === "Custom" && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] bg-primary rounded-r-full" />
                  )}
                  Custom Range
                </button>
              </div>

              {/* Right: dual-month calendar */}
              <div className="flex-1 overflow-auto p-3 sm:p-5 flex items-start justify-center">
                <DayPicker
                  mode="range"
                  selected={calRange}
                  onSelect={handleCalSelect}
                  numberOfMonths={2}
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  fromMonth={META_EARLIEST}
                  toDate={today}
                  showOutsideDays={false}
                  classNames={{
                    root:          "select-none w-full",
                    months:        "flex flex-col sm:flex-row gap-4 sm:gap-8 justify-center",
                    month:         "flex flex-col gap-2 w-full sm:w-auto",
                    month_caption: "flex items-center justify-center h-9 px-10 relative",
                    caption_label: "text-sm font-semibold text-white/90",
                    nav:           "absolute inset-x-0 top-0 flex justify-between items-center h-9 px-0",
                    button_previous: cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      "text-white/35 hover:text-white hover:bg-white/8 transition-colors",
                      "disabled:opacity-15 disabled:cursor-not-allowed",
                    ),
                    button_next: cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      "text-white/35 hover:text-white hover:bg-white/8 transition-colors",
                      "disabled:opacity-15 disabled:cursor-not-allowed",
                    ),
                    weekdays: "flex mb-0.5",
                    weekday:  "flex-1 text-center text-[11px] font-medium text-white/25 py-1.5",
                    week:     "flex mt-0.5",
                    day:      "flex-1 h-9 relative",
                    day_button: "w-full h-full",
                    outside:  "opacity-0 pointer-events-none",
                    disabled: "opacity-20 pointer-events-none",
                    hidden:   "invisible",
                    range_start: "",
                    range_middle: "",
                    range_end: "",
                    selected: "",
                  }}
                  components={{
                    Chevron: ({ orientation }) =>
                      orientation === "left"
                        ? <ChevronLeft  className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />,

                    DayButton: ({ day, modifiers, children, ...btnProps }) => {
                      const isStart  = !!modifiers.range_start;
                      const isEnd    = !!modifiers.range_end;
                      const isMid    = !!modifiers.range_middle;
                      const todayDay = isToday(day.date);
                      const isSel    = isStart || isEnd;
                      const hasBoth  = !!(calRange?.from && calRange?.to);

                      return (
                        <div className="relative w-full h-9 flex items-center justify-center">
                          {/* Range highlight band */}
                          {isMid && (
                            <span className="absolute inset-y-[3px] inset-x-0 bg-primary/[0.12] pointer-events-none" />
                          )}
                          {isStart && hasBoth && (
                            <span className="absolute inset-y-[3px] left-1/2 right-0 bg-primary/[0.12] pointer-events-none" />
                          )}
                          {isEnd && hasBoth && calRange!.from! < day.date && (
                            <span className="absolute inset-y-[3px] left-0 right-1/2 bg-primary/[0.12] pointer-events-none" />
                          )}

                          {/* Day button */}
                          <button
                            {...btnProps}
                            className={cn(
                              "relative z-10 w-8 h-8 rounded-full flex items-center justify-center",
                              "text-[13px] font-medium transition-all duration-100",
                              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                              isSel
                                ? "bg-primary text-black font-bold shadow-lg shadow-primary/25 scale-105"
                                : isMid
                                ? "text-white/85 hover:bg-white/10"
                                : todayDay
                                ? "text-primary ring-[1.5px] ring-primary/50 hover:bg-primary/15"
                                : "text-white/75 hover:bg-white/10",
                            )}
                          >
                            {children}
                            {/* Today indicator dot */}
                            {todayDay && !isSel && (
                              <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 h-[3px] w-[3px] rounded-full bg-primary" />
                            )}
                          </button>
                        </div>
                      );
                    },
                  }}
                />
              </div>
            </div>

            {/* ── Mobile preset strip ─────────────────────────────────── */}
            <div
              className="sm:hidden flex gap-1.5 px-4 pb-2 overflow-x-auto flex-shrink-0"
              style={{ scrollbarWidth: "none" }}
            >
              {DATE_PRESETS.slice(0, 7).map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePresetClick(p)}
                  className={cn(
                    "flex-shrink-0 px-3 py-1 text-[11px] rounded-full border transition-colors",
                    selectedPreset === p.label
                      ? "bg-primary text-black border-primary font-semibold"
                      : "border-white/15 text-white/55 hover:border-white/30 hover:text-white",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.07] bg-white/[0.02] flex-shrink-0">
              {/* Selected range display */}
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {calRange?.from ? (
                  <>
                    <span className="text-[11px] font-mono text-white/90 bg-white/6 px-2.5 py-1 rounded-md border border-white/10 whitespace-nowrap flex-shrink-0">
                      {format(calRange.from, "MMM d, yyyy")}
                    </span>
                    <span className="text-white/25 text-xs flex-shrink-0">→</span>
                    <span className="text-[11px] font-mono text-white/90 bg-white/6 px-2.5 py-1 rounded-md border border-white/10 whitespace-nowrap flex-shrink-0">
                      {calRange.to
                        ? format(calRange.to, "MMM d, yyyy")
                        : <span className="text-white/35 italic not-italic">pick end date</span>}
                    </span>
                    {calRange.to && (
                      <span className="text-xs text-primary/75 font-semibold flex-shrink-0 hidden md:block">
                        · {dayCount(format(calRange.from, "yyyy-MM-dd"), format(calRange.to, "yyyy-MM-dd"))}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-white/30">Click to select a start date</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs font-medium text-white/45 hover:text-white rounded-lg hover:bg-white/8 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!calRange?.from || !calRange?.to}
                  className={cn(
                    "px-5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150",
                    calRange?.from && calRange?.to
                      ? "bg-primary text-black hover:bg-primary/85 shadow-md shadow-primary/20 active:scale-95"
                      : "bg-white/8 text-white/25 cursor-not-allowed",
                  )}
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
