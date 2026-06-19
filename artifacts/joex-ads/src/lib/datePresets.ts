import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";

// Meta API hard limit: 37 months back from today (use 36 to be safe)
export const META_EARLIEST = subMonths(new Date(), 36);

export interface Preset {
  label: string;
  since: () => string;
  until: () => string;
}

export const DATE_PRESETS: Preset[] = [
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
    label: "This Year",
    since: () => format(startOfYear(new Date()), "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
  {
    label: "Maximum",
    since: () => format(META_EARLIEST, "yyyy-MM-dd"),
    until: () => format(new Date(), "yyyy-MM-dd"),
  },
];

export const PRESET_LABEL_SET = new Set(DATE_PRESETS.map((p) => p.label));
