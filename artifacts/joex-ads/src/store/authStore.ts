import { create } from "zustand";

interface AuthStore {
  token: string | null;
  setToken: (t: string) => void;
  clearToken: () => void;
  isValidated: boolean;
  setValidated: (v: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: localStorage.getItem("joex_ads_token"),
  setToken: (t) => {
    localStorage.setItem("joex_ads_token", t);
    set({ token: t });
  },
  clearToken: () => {
    localStorage.removeItem("joex_ads_token");
    set({ token: null, isValidated: false });
  },
  isValidated: false,
  setValidated: (v) => set({ isValidated: v }),
}));
