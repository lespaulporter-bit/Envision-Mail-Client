"use client";

import {
  formatClockInZone,
  localTimezoneId,
  timezoneDisplayName,
  timezoneShortLabel,
} from "@/lib/timezones";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type Props = {
  primaryZone: string;
  secondaryZone?: string | null;
  dual: boolean;
  className?: string;
};

/** Neat live clocks for the Calendar header — local only by default, optional second zone. */
export function CalendarTimezoneClocks({ primaryZone, secondaryZone, dual, className }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const primary = primaryZone || localTimezoneId();
  const zones =
    dual && secondaryZone && secondaryZone !== primary
      ? [
          { id: primary, label: timezoneDisplayName(primary), short: timezoneShortLabel(primary) },
          {
            id: secondaryZone,
            label: timezoneDisplayName(secondaryZone),
            short: timezoneShortLabel(secondaryZone),
          },
        ]
      : [{ id: primary, label: timezoneDisplayName(primary), short: timezoneShortLabel(primary) }];

  return (
    <div className={cn("flex flex-wrap items-stretch gap-2", className)}>
      {zones.map((z) => (
        <div
          key={z.id}
          className="min-w-[7.5rem] rounded-2xl border border-line/80 bg-white/80 px-3.5 py-2 shadow-sm backdrop-blur"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            {z.label}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-display text-xl tracking-tight text-ink tabular-nums">
              {formatClockInZone(now, z.id)}
            </span>
            <span className="text-[11px] font-medium text-teal">{z.short}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
