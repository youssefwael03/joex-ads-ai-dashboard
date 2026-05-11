import { useAccountStore } from "@/store/accountStore";
import { fmtCurrency } from "@/lib/metaApi";

export function useAccountCurrency(): string {
  return useAccountStore((s) => s.selectedAccountCurrency) || "USD";
}

export function useFormatCurrency() {
  const currency = useAccountCurrency();
  return (v: unknown) => fmtCurrency(v, currency);
}
