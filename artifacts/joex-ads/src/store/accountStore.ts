import { create } from "zustand";

export interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  business?: { name: string };
}

interface AccountStore {
  selectedAccountId: string | null;
  selectedAccountName: string;
  selectedAccountCurrency: string;
  accounts: AdAccount[];
  setAccounts: (a: AdAccount[]) => void;
  selectAccount: (id: string) => void;
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  selectedAccountId: null,
  selectedAccountName: "",
  selectedAccountCurrency: "USD",
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  selectAccount: (id) => {
    const account = get().accounts.find(a => a.id === id);
    if (account) {
      set({ 
        selectedAccountId: id, 
        selectedAccountName: account.name,
        selectedAccountCurrency: account.currency
      });
    } else {
      set({ selectedAccountId: id });
    }
  },
}));
