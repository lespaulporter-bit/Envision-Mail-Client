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

/** Compact live clocks for the Calendar header — side-by-side when dual is on. */
export function CalendarTimezoneClocks({ primaryZone, secondaryZone, dual, className }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // Align to the next minute, then tick every minute (clocks only show HH:MM)
    const msToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
    let intervalId = 0;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
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
    <div
      className={cn(
        "inline-flex max-w-full shrink-0 flex-nowrap items-stretch overflow-hidden rounded-xl border border-line/80 bg-white/85 shadow-sm backdrop-blur",
        className,
      )}
      title={zones.map((z) => `${z.label}: ${formatClockInZone(now, z.id)}`).join(" · ")}
    >
      {zones.map((z, i) => (
        <div
          key={z.id}
          className={cn(
            "flex min-w-0 flex-col justify-center px-2.5 py-1.5",
            i > 0 && "border-l border-line/70",
          )}
        >
          <div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
            {z.label}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-display text-[15px] leading-none tracking-tight text-ink tabular-nums">
              {formatClockInZone(now, z.id)}
            </span>
            <span className="text-[10px] font-medium text-teal">{z.short}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
