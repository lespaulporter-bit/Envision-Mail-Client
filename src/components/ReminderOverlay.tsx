"use client";

import { useMailStore } from "@/lib/store";
import type { Reminder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Bell, CalendarDays, Mail, MapPin, Video } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

function formatDueLabel(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ReminderCard({
  reminder,
  index,
  total,
}: {
  reminder: Reminder;
  index: number;
  total: number;
}) {
  const dismissReminder = useMailStore((s) => s.dismissReminder);
  const snoozeReminder = useMailStore((s) => s.snoozeReminder);
  const openReminder = useMailStore((s) => s.openReminder);

  return (
    <article
      className={cn(
        "reminder-card pointer-events-auto relative overflow-hidden rounded-2xl",
        "border border-white/12 bg-[linear-gradient(165deg,rgba(28,36,42,0.97)_0%,rgba(18,24,28,0.98)_55%,rgba(12,18,22,0.99)_100%)]",
        "shadow-[0_28px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
        "animate-reminder-in",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
      role="alertdialog"
      aria-label={`Reminder: ${reminder.title}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c4a574]/70 to-transparent"
        aria-hidden
      />
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-teal/20 blur-3xl" aria-hidden />

      <div className="relative px-6 pb-5 pt-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10">
              {reminder.source === "calendar" ? (
                <CalendarDays className="h-4 w-4 text-[#c4a574]" />
              ) : (
                <Mail className="h-4 w-4 text-teal-bright" />
              )}
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c4a574]/90">
                Reminder{total > 1 ? ` · ${index + 1} of ${total}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-white/45">{formatDueLabel(reminder.dueAt)}</p>
            </div>
          </div>
          <Bell className="h-4 w-4 text-white/35" aria-hidden />
        </div>

        <h2 className="font-display text-[1.55rem] leading-tight tracking-tight text-white">
          {reminder.title}
        </h2>
        {reminder.subtitle ? (
          <p className="mt-1.5 text-sm text-white/55">{reminder.subtitle}</p>
        ) : null}

        {(reminder.location || reminder.meetingUrl) && (
          <div className="mt-3 space-y-1.5 text-sm text-white/60">
            {reminder.location ? (
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#c4a574]/80" />
                <span className="truncate">{reminder.location}</span>
              </p>
            ) : null}
            {reminder.meetingUrl ? (
              <a
                href={reminder.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-teal-bright hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Video className="h-3.5 w-3.5" />
                Join meeting
              </a>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-white/90 active:scale-[0.98]"
            onClick={() => {
              openReminder(reminder.id);
              dismissReminder(reminder.id);
            }}
          >
            Open
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-[0.98]"
            onClick={() => dismissReminder(reminder.id)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-[0.98]"
            onClick={() => snoozeReminder(reminder.id, 5)}
          >
            Snooze 5 min
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-[0.98]"
            onClick={() => snoozeReminder(reminder.id, 15)}
          >
            Snooze 15 min
          </button>
        </div>
      </div>
    </article>
  );
}

/** Prestigious Outlook-style reminder stack — ticks the reminder engine. */
export function ReminderOverlay() {
  const reminders = useMailStore((s) => s.reminders || []);
  const tickReminders = useMailStore((s) => s.tickReminders);
  const notifiedRef = useRef<Set<string>>(new Set());

  const active = useMemo(
    () => reminders.filter((r) => r.status === "active").slice(0, 4),
    [reminders],
  );

  useEffect(() => {
    tickReminders();
    const id = window.setInterval(() => tickReminders(), 15_000);
    const onFocus = () => tickReminders();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [tickReminders]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    for (const r of active) {
      if (notifiedRef.current.has(r.id)) continue;
      notifiedRef.current.add(r.id);
      try {
        if (Notification.permission === "granted") {
          new Notification(r.title, {
            body: r.subtitle || "Envision Mail reminder",
            tag: r.occurrenceKey,
          });
        } else if (Notification.permission === "default") {
          void Notification.requestPermission().then((perm) => {
            if (perm === "granted") {
              new Notification(r.title, {
                body: r.subtitle || "Envision Mail reminder",
                tag: r.occurrenceKey,
              });
            }
          });
        }
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  if (!active.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center sm:p-8"
      aria-live="assertive"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,23,28,0.35)_0%,rgba(15,23,28,0.12)_45%,transparent_70%)]" />
      <div className="relative flex w-full max-w-lg flex-col gap-3">
        {active.map((r, i) => (
          <ReminderCard key={r.id} reminder={r} index={i} total={active.length} />
        ))}
      </div>
    </div>
  );
}
