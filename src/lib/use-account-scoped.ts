import { useShallow } from "zustand/react/shallow";
import { filterByActiveAccount } from "@/lib/account-scope";
import { useMailStore } from "@/lib/store";

/**
 * Account-scoped list from the store.
 * Must use shallow compare — returning a fresh .filter() array from a bare selector
 * makes React useSyncExternalStore see an unstable snapshot (React #185 / max update depth).
 */
export function useAccountScoped<T extends { accountId?: string | null }>(
  select: (s: ReturnType<typeof useMailStore.getState>) => T[] | null | undefined,
): T[] {
  return useMailStore(useShallow((s) => filterByActiveAccount(select(s), s.inboxAccountId)));
}
