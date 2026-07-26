/** Monday (local) as yyyy-MM-dd — week key for “Sometime this week”. */
export function weekStartKey(from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

export type SometimeTaskLike = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  weekKey?: string;
  carriedOver?: boolean;
};

/**
 * Drop completed tasks; carry incomplete tasks into the current week.
 * Unchecked items are never deleted — only their weekKey advances.
 */
export function normalizeSometimeTasks<T extends SometimeTaskLike>(
  tasks: T[],
  now: Date = new Date(),
): T[] {
  const week = weekStartKey(now);
  return (tasks || [])
    .filter((t) => t && !t.done && String(t.text || "").trim())
    .map((t) => {
      const prior =
        t.weekKey ||
        weekStartKey(t.createdAt ? new Date(t.createdAt) : now);
      if (prior < week) {
        return { ...t, done: false, weekKey: week, carriedOver: true };
      }
      return { ...t, done: false, weekKey: prior || week };
    });
}
