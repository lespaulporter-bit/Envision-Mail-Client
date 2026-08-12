/** Shared empty array for Zustand selectors — never allocate `|| []` inside a selector. */
export const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

/** Return the array or a stable empty fallback (avoids React #185 / unstable getSnapshot). */
export function asArray<T>(value: T[] | null | undefined): T[] {
  return (value ?? EMPTY_ARRAY) as T[];
}
