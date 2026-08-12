"use client";

import { Button } from "@/components/ui";
import { useMailStore } from "@/lib/store";

/** Same Multi strip MoneyBox already had — available wherever Multi is used. */
export function MultiOpenBanner() {
  const multiOpenIds = useMailStore((s) => s.multiOpenIds);
  const openThread = useMailStore((s) => s.openThread);
  const clearMultiOpen = useMailStore((s) => s.clearMultiOpen);

  if (multiOpenIds.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-teal/30 bg-[#e6f7f3] px-4 py-3 text-sm">
      <span>
        <strong>{multiOpenIds.length}</strong> email{multiOpenIds.length === 1 ? "" : "s"} selected to open
        together.
      </span>
      <Button size="sm" variant="soft" onClick={() => multiOpenIds.forEach((id) => openThread(id))}>
        Jump first
      </Button>
      <Button size="sm" variant="ghost" onClick={clearMultiOpen}>
        Clear
      </Button>
    </div>
  );
}
