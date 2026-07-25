"use client";

import { Button } from "@/components/ui";
import { useHeyStore } from "@/lib/store";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";

export function CoverArt() {
  const settings = useHeyStore((s) => s.settings);
  const events = useHeyStore((s) => s.events);
  const habits = useHeyStore((s) => s.habits);
  const sometimeTasks = useHeyStore((s) => s.sometimeTasks);
  const toggleHabit = useHeyStore((s) => s.toggleHabit);
  const toggleSometimeTask = useHeyStore((s) => s.toggleSometimeTask);
  const addSometimeTask = useHeyStore((s) => s.addSometimeTask);
  const addEvent = useHeyStore((s) => s.addEvent);
  const setView = useHeyStore((s) => s.setView);
  const [task, setTask] = useState("");
  const today = new Date().toISOString().slice(0, 10);

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
        : "var(--hey-gradient)";

  return (
    <section className="animate-cover-rise relative mb-6 overflow-hidden rounded-3xl text-white shadow-lg" style={{ background: gradient, minHeight: 280 }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
      <div className="relative p-6 md:p-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Cover Art</p>
            <h2 className="font-display text-3xl">
              {settings.coverArt === "calendar" ? "Your schedule" : "Previously seen, tucked away"}
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
                calendarId: "cal1",
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
                  const days = Math.ceil((+new Date(e.start) - Date.now()) / 86400_000);
                  return (
                    <li key={e.id}>
                      <strong>{days}d</strong> · {e.title}
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
                      <input type="checkbox" checked={t.done} onChange={() => toggleSometimeTask(t.id)} />
                      <span>{t.text}</span>
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
            Previously seen emails are under this cover. New for you stays on top — tidy LesBox energy.
          </p>
        )}
      </div>
    </section>
  );
}
