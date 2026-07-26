"use client";

import { Button } from "@/components/ui";
import { useMailStore } from "@/lib/store";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";

function formatCountdown(targetIso: string, nowMs: number) {
  const diff = +new Date(targetIso) - nowMs;
  if (diff <= 0) return { label: "Now", urgent: true };
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days >= 1) {
    return {
      label: `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`,
      urgent: days < 2,
    };
  }
  return {
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    urgent: hours < 6,
  };
}

export function CoverArt() {
  const settings = useMailStore((s) => s.settings);
  const events = useMailStore((s) => s.events);
  const habits = useMailStore((s) => s.habits);
  const sometimeTasks = useMailStore((s) => s.sometimeTasks);
  const toggleHabit = useMailStore((s) => s.toggleHabit);
  const toggleSometimeTask = useMailStore((s) => s.toggleSometimeTask);
  const addSometimeTask = useMailStore((s) => s.addSometimeTask);
  const addEvent = useMailStore((s) => s.addEvent);
  const setView = useMailStore((s) => s.setView);
  const [task, setTask] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => +new Date(e.end) >= Date.now())
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))
        .slice(0, 5),
    [events],
  );

  const countdowns = upcoming.filter((e) => e.countdown);
  const joinable = upcoming.find(
    (e) => e.meetingUrl && +new Date(e.start) - Date.now() < 15 * 60_000 && +new Date(e.start) > Date.now() - 5 * 60_000,
  );

  if (settings.coverArt === "none") return null;

  const gradient =
    settings.coverArt === "photo"
      ? "linear-gradient(160deg, rgba(29,45,53,0.55), rgba(85,34,250,0.55)), url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80') center/cover"
      : settings.coverArt === "calendar"
        ? "linear-gradient(145deg, #0b1c2c 0%, #1a3a5c 45%, #5522fa 100%)"
        : "var(--em-gradient)";

  return (
    <section className="animate-cover-rise relative mb-6 overflow-hidden rounded-3xl text-white shadow-lg" style={{ background: gradient, minHeight: 280 }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
      <div className="relative p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Day Cover</p>
            <h2 className="font-display text-3xl">
              {settings.coverArt === "calendar" ? "Your schedule" : "Seen, tucked away"}
            </h2>
          </div>
          <Button
            size="sm"
            variant="soft"
            className="!bg-white/15 !text-white hover:!bg-white/25"
            onClick={() => {
              const start = new Date();
              start.setHours(start.getHours() + 2, 0, 0, 0);
              const end = new Date(start);
              end.setHours(end.getHours() + 1);
              addEvent({
                title: "New event",
                start: start.toISOString(),
                end: end.toISOString(),
                calendarId: "cal_default",
              });
              setView("calendar");
            }}
          >
            + Event
          </Button>
        </div>

        {joinable?.meetingUrl ? (
          <a
            href={joinable.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-4 inline-flex items-center rounded-full bg-salmon px-4 py-2 text-sm font-semibold shadow"
          >
            Join {joinable.title} now
          </a>
        ) : null}

        {settings.coverArt === "calendar" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">Up next</h3>
              <ul className="space-y-2 text-sm">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="text-left hover:underline" onClick={() => setView("calendar")}>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-white/70">{format(parseISO(e.start), "EEE h:mm a")}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">Countdowns</h3>
              <ul className="space-y-2 text-sm">
                {countdowns.length === 0 ? <li className="text-white/70">None yet</li> : null}
                {countdowns.map((e) => {
                  const cd = formatCountdown(e.start, nowMs);
                  return (
                    <li key={e.id} className={cd.urgent ? "text-amber-200" : ""}>
                      <div className="font-mono text-base font-semibold tracking-tight">{cd.label}</div>
                      <div className="text-white/80">{e.title}</div>
                      <div className="text-[11px] text-white/55">{format(parseISO(e.start), "EEE MMM d · h:mm a")}</div>
                    </li>
                  );
                })}
              </ul>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-white/70">Habits</h3>
              <div className="flex flex-wrap gap-2">
                {habits.map((h) => {
                  const done = h.completedDates.includes(today);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleHabit(h.id, today)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${done ? "bg-mint text-white" : "bg-white/15"}`}
                    >
                      {done ? "✓ " : ""}
                      {h.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">Sometime this week</h3>
              <ul className="space-y-2 text-sm">
                {sometimeTasks
                  .filter((t) => !t.done)
                  .slice(0, 5)
                  .map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleSometimeTask(t.id)}
                        aria-label={`Complete ${t.text}`}
                      />
                      <span>
                        {t.text}
                        {t.carriedOver ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-white/50">Rolled over</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
              </ul>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (task.trim()) {
                    addSometimeTask(task.trim());
                    setTask("");
                  }
                }}
              >
                <input
                  className="w-full rounded-lg border-0 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none"
                  placeholder="Add a task from an email…"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                />
              </form>
            </div>
          </div>
        ) : (
          <p className="max-w-lg text-white/85">
            Seen emails are under this cover. Fresh stays on top — tidy MoneyBox $ energy.
          </p>
        )}
      </div>
    </section>
  );
}
