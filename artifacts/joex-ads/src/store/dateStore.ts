import { create } from "zustand";
import { subDays, format } from "date-fns";

interface DateStore {
  since: string;
  until: string;
  preset: string;
  setDateRange: (since: string, until: string, preset: string) => void;
}

const today = new Date();
const thirtyDaysAgo = subDays(today, 30);

export const useDateStore = create<DateStore>((set) => ({
  since: format(thirtyDaysAgo, "yyyy-MM-dd"),
  until: format(today, "yyyy-MM-dd"),
  preset: "Last 30 days",
  setDateRange: (since, until, preset) => set({ since, until, preset }),
}));
