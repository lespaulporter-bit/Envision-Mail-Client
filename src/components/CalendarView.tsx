"use client";

import { Button, Input, SectionHeader, Textarea } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import type { CalendarInvitee } from "@/lib/types";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useEffect, useMemo, useState } from "react";

function defaultStartTime(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return format(d, "HH:mm");
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  d.setHours(d.getHours() + 1);
  return format(d, "HH:mm");
}

export function CalendarView() {
  const calendarDate = useMailStore((s) => s.calendarDate);
  const calendarView = useMailStore((s) => s.calendarView);
  const setCalendarDate = useMailStore((s) => s.setCalendarDate);
  const setCalendarView = useMailStore((s) => s.setCalendarView);
  const events = useMailStore((s) => s.events);
  const calendars = useMailStore((s) => s.calendars);
  const habits = useMailStore((s) => s.habits);
  const journal = useMailStore((s) => s.journal);
  const dayLabels = useMailStore((s) => s.dayLabels);
  const sometimeTasks = useMailStore((s) => s.sometimeTasks);
  const settings = useMailStore((s) => s.settings);
  const addEvent = useMailStore((s) => s.addEvent);
  const updateEvent = useMailStore((s) => s.updateEvent);
  const deleteEvent = useMailStore((s) => s.deleteEvent);
  const importMacCalendarData = useMailStore((s) => s.importMacCalendarData);
  const toggleHabit = useMailStore((s) => s.toggleHabit);
  const setJournal = useMailStore((s) => s.setJournal);
  const setDayLabel = useMailStore((s) => s.setDayLabel);
  const addSometimeTask = useMailStore((s) => s.addSometimeTask);
  const toggleSometimeTask = useMailStore((s) => s.toggleSometimeTask);
  const setToast = useMailStore((s) => s.setToast);

  const date = parseISO(calendarDate);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(calendarDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(() => addOneHour(defaultStartTime()));
  const [inviteesText, setInviteesText] = useState("");
  const [useTeams, setUseTeams] = useState(true);
  const [teamsUrl, setTeamsUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [syncingMac, setSyncingMac] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [journalDraft, setJournalDraft] = useState("");
  const isMacDesktop = isDesktop() && desktopApi()?.platform === "darwin";

  useEffect(() => {
    setJournalDraft(journal.find((j) => j.date === calendarDate)?.body || "");
  }, [calendarDate, journal]);

  useEffect(() => {
    setEventDate(calendarDate);
  }, [calendarDate]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.listAccounts().then((list) => {
      if (list[0]) setAccountId(list[0].id);
    });
  }, []);

  const days = useMemo(() => {
    if (calendarView === "day") return [date];
    if (calendarView === "week") {
      return eachDayOfInterval({ start: startOfWeek(date), end: endOfWeek(date) });
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(date)),
      end: endOfWeek(endOfMonth(date)),
    });
  }, [calendarDate, calendarView, date]);

  const visibleCalIds = new Set(calendars.filter((c) => c.visible).map((c) => c.id));
  const dayEvents = (d: Date) =>
    events
      .filter((e) => visibleCalIds.has(e.calendarId) && isSameDay(parseISO(e.start), d))
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  const colorFor = (calendarId: string) => calendars.find((c) => c.id === calendarId)?.color || "#5522FA";

  const parseInvitees = (text: string): CalendarInvitee[] =>
    text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email, status: "pending" as const }));

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Calendar"
        subtitle="Events, Teams meeting links, email invites (.ics), habits, journal, and countdowns."
        actions={
          <>
            {(["day", "week", "month"] as const).map((v) => (
              <Button key={v} size="sm" variant={calendarView === v ? "primary" : "soft"} onClick={() => setCalendarView(v)}>
                {v}
              </Button>
            ))}
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                setCalendarDate(
                  format(addDays(date, calendarView === "month" ? -30 : calendarView === "week" ? -7 : -1), "yyyy-MM-dd"),
                )
              }
            >
              ←
            </Button>
            <Button size="sm" variant="soft" onClick={() => setCalendarDate(format(new Date(), "yyyy-MM-dd"))}>
              Today
            </Button>
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                setCalendarDate(
                  format(addDays(date, calendarView === "month" ? 30 : calendarView === "week" ? 7 : 1), "yyyy-MM-dd"),
                )
              }
            >
              →
            </Button>
            {isMacDesktop ? (
              <Button
                size="sm"
                variant="soft"
                disabled={syncingMac}
                onClick={() => {
                  void (async () => {
                    setSyncingMac(true);
                    try {
                      const api = desktopApi();
                      const result = await api?.syncMacCalendars();
                      if (!result?.ok) {
                        setToast(result?.error || "Mac Calendar sync failed");
                        return;
                      }
                      importMacCalendarData({
                        calendars: result.calendars || [],
                        events: result.events || [],
                      });
                    } finally {
                      setSyncingMac(false);
                    }
                  })();
                }}
              >
                {syncingMac ? "Syncing…" : "Sync Mac Calendars"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        <span>Primary TZ: {settings.timezone}</span>
        {settings.secondaryTimezone ? <span>Secondary: {settings.secondaryTimezone}</span> : null}
        {calendars.some((c) => c.source === "mac") ? (
          <span>{calendars.filter((c) => c.source === "mac").length} Mac calendar(s)</span>
        ) : null}
      </div>

      <div className={`mb-6 grid gap-2 ${calendarView === "month" ? "grid-cols-7" : calendarView === "week" ? "grid-cols-2 md:grid-cols-7" : "grid-cols-1"}`}>
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const label = dayLabels.find((x) => x.date === key)?.label;
          const selected = isSameDay(d, date);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCalendarDate(key)}
              className={`min-h-28 rounded-2xl border p-2 text-left transition ${
                selected ? "border-blurple bg-[#f7f4ff]" : "border-line bg-white/85 hover:bg-soft/60"
              } ${calendarView === "month" && !isSameMonth(d, date) ? "opacity-40" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">{format(d, calendarView === "month" ? "d" : "EEE d")}</span>
                {label ? <span className="truncate text-[10px] text-blurple">{label}</span> : null}
              </div>
              <ul className="space-y-1">
                {dayEvents(d)
                  .slice(0, calendarView === "month" ? 3 : 8)
                  .map((e) => (
                    <li
                      key={e.id}
                      className="truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                      style={{ background: colorFor(e.calendarId) }}
                      title={e.title}
                    >
                      {e.source === "mac" ? "Mac · " : ""}
                      {e.meetingProvider === "teams" ? "Teams · " : ""}
                      {e.title}
                    </li>
                  ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white/90 p-4 lg:col-span-2">
          <h3 className="mb-3 font-display text-xl">Events on {format(date, "MMMM d")}</h3>
          <ul className="space-y-3">
            {dayEvents(date).map((e) => (
              <li key={e.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {e.title}
                      {e.source === "mac" ? (
                        <span className="ml-2 text-xs font-normal text-muted">Mac</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted">
                      {format(parseISO(e.start), "h:mm a")} – {format(parseISO(e.end), "h:mm a")}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                    {e.meetingUrl ? (
                      <a className="text-sm text-blurple underline" href={e.meetingUrl} target="_blank" rel="noreferrer">
                        {e.meetingProvider === "teams" ? "Join Teams meeting" : "Join meeting"}
                      </a>
                    ) : null}
                    {e.invitees?.length ? (
                      <p className="mt-1 text-xs text-muted">
                        Invitees: {e.invitees.map((i) => i.email).join(", ")}
                        {e.invitesSentAt ? ` · sent ${format(parseISO(e.invitesSentAt), "MMM d h:mm a")}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="soft" onClick={() => updateEvent(e.id, { countdown: !e.countdown })}>
                      {e.countdown ? "Countdown ✓" : "Countdown"}
                    </Button>
                    {isDesktop() && accountId && (e.invitees?.length || 0) > 0 ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={sendingInviteId === e.id}
                        onClick={async () => {
                          setSendingInviteId(e.id);
                          try {
                            const api = desktopApi();
                            const result = await api?.sendCalendarInvites({ accountId, event: e });
                            if (!result?.ok) {
                              setToast(result?.error || "Invite send failed");
                              return;
                            }
                            updateEvent(e.id, { invitesSentAt: new Date().toISOString() });
                            setToast(`Invites emailed to ${e.invitees?.length} people`);
                          } finally {
                            setSendingInviteId(null);
                          }
                        }}
                      >
                        {sendingInviteId === e.id ? "Sending…" : "Email invites"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => deleteEvent(e.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {dayEvents(date).length === 0 ? <li className="text-sm text-muted">No events yet.</li> : null}
          </ul>

          <form
            className="mt-4 space-y-2 rounded-xl border border-[#e8d5ff]/60 bg-[linear-gradient(145deg,#fff0e8_0%,#f3e8ff_55%,#e8f4ff_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (!title.trim()) return;
              if (!eventDate || !startTime || !endTime) {
                setToast("Date, start time, and end time are required");
                return;
              }
              const start = parseISO(`${eventDate}T${startTime}:00`);
              const end = parseISO(`${eventDate}T${endTime}:00`);
              if (Number.isNaN(+start) || Number.isNaN(+end)) {
                setToast("Invalid date or time");
                return;
              }
              if (end <= start) {
                setToast("End time must be after start time");
                return;
              }
              const invitees = parseInvitees(inviteesText);
              let meetingUrl = teamsUrl.trim();
              let meetingProvider: "teams" | "none" = meetingUrl ? "teams" : "none";
              if (useTeams && !meetingUrl) {
                const api = desktopApi();
                if (api) {
                  const gen = await api.generateTeamsUrl(title.trim());
                  meetingUrl = gen.url;
                  meetingProvider = "teams";
                } else {
                  meetingUrl = `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${Date.now()}%40thread.v2/0`;
                  meetingProvider = "teams";
                }
              }
              addEvent({
                title: title.trim(),
                start: start.toISOString(),
                end: end.toISOString(),
                calendarId: "cal2",
                reminderMinutes: [15],
                invitees,
                meetingUrl: meetingUrl || undefined,
                meetingProvider,
                notes: meetingProvider === "teams" ? "Microsoft Teams meeting" : undefined,
                source: "local",
              });
              setTitle("");
              setInviteesText("");
              setTeamsUrl("");
              setToast("Event added — use Email invites to notify people");
            }}
          >
            <h4 className="text-sm font-semibold text-ink">New event + Teams invite</h4>
            <Input placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs font-medium text-muted">
                Date
                <Input
                  className="mt-1"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                Start time
                <Input
                  className="mt-1"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStartTime(next);
                    if (endTime <= next) setEndTime(addOneHour(next));
                  }}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                End time
                <Input
                  className="mt-1"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </label>
            </div>
            <Textarea
              rows={2}
              placeholder="Invitee emails (comma or newline separated) — unlimited"
              value={inviteesText}
              onChange={(e) => setInviteesText(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useTeams} onChange={(e) => setUseTeams(e.target.checked)} />
              Create Microsoft Teams meeting link
            </label>
            <Input
              placeholder="Or paste an existing Teams / Zoom / Meet URL"
              value={teamsUrl}
              onChange={(e) => setTeamsUrl(e.target.value)}
            />
            {isDesktop() && accountId ? (
              <p className="text-xs text-muted">Invites send from your connected SMTP account after the event is created.</p>
            ) : (
              <p className="text-xs text-amber">Connect an IMAP/SMTP account in Settings to email calendar invites.</p>
            )}
            <Button type="submit">Add event</Button>
          </form>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white/90 p-4">
            <h3 className="mb-2 font-display text-lg">Journal</h3>
            <Textarea
              rows={4}
              value={journalDraft}
              onChange={(e) => setJournalDraft(e.target.value)}
              onBlur={() => setJournal(calendarDate, journalDraft)}
              placeholder="Private notes for the day…"
            />
          </section>
          <section className="rounded-2xl border border-line bg-white/90 p-4">
            <h3 className="mb-2 font-display text-lg">Day label</h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setDayLabel(calendarDate, labelDraft.trim());
                setLabelDraft("");
              }}
            >
              <Input
                placeholder={dayLabels.find((d) => d.date === calendarDate)?.label || "e.g. Travel day"}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
              />
              <Button type="submit" variant="soft">
                Set
              </Button>
            </form>
          </section>
          <section className="rounded-2xl border border-line bg-white/90 p-4">
            <h3 className="mb-2 font-display text-lg">Habits</h3>
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => {
                const done = h.completedDates.includes(calendarDate);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => toggleHabit(h.id, calendarDate)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: done ? h.color : "#c9d1d6" }}
                  >
                    {done ? "✓ " : ""}
                    {h.name}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-white/90 p-4">
            <h3 className="mb-2 font-display text-lg">Sometime this week</h3>
            <ul className="mb-2 space-y-1 text-sm">
              {sometimeTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={t.done} onChange={() => toggleSometimeTask(t.id)} />
                  <span className={t.done ? "text-muted line-through" : ""}>{t.text}</span>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (taskDraft.trim()) {
                  addSometimeTask(taskDraft.trim());
                  setTaskDraft("");
                }
              }}
            >
              <Input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} placeholder="Add task" />
              <Button type="submit" variant="soft">
                Add
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
