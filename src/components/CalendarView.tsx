"use client";

import { Button, Input, SectionHeader, Textarea } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import type { CalendarEvent, CalendarInvitee } from "@/lib/types";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  differenceInCalendarDays,
  differenceInMinutes,
} from "date-fns";
import { useEffect, useMemo, useState } from "react";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am–8pm

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

function formatInTz(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return format(parseISO(iso), "h:mm a");
  }
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
  const duplicateEvent = useMailStore((s) => s.duplicateEvent);
  const toggleCalendarVisible = useMailStore((s) => s.toggleCalendarVisible);
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
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [inviteesText, setInviteesText] = useState("");
  const [useTeams, setUseTeams] = useState(false);
  const [teamsUrl, setTeamsUrl] = useState("");
  const [teamsInstalled, setTeamsInstalled] = useState<boolean | null>(null);
  const [openingTeams, setOpeningTeams] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [syncingMac, setSyncingMac] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [journalDraft, setJournalDraft] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCalId, setSelectedCalId] = useState("");
  /** Minutes before start — 0 = at start time; -1 = none */
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(15);
  const isMacDesktop = isDesktop() && desktopApi()?.platform === "darwin";

  const defaultCalId =
    calendars.find((c) => c.source !== "mac" && c.visible)?.id ||
    calendars[0]?.id ||
    "cal_default";

  useEffect(() => {
    setJournalDraft(journal.find((j) => j.date === calendarDate)?.body || "");
  }, [calendarDate, journal]);

  useEffect(() => {
    setEventDate(calendarDate);
  }, [calendarDate]);

  useEffect(() => {
    if (!selectedCalId && defaultCalId) setSelectedCalId(defaultCalId);
  }, [defaultCalId, selectedCalId]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) {
      setTeamsInstalled(false);
      return;
    }
    void api.detectTeams?.().then((res) => {
      setTeamsInstalled(Boolean(res?.installed));
      if (!res?.installed) setUseTeams(false);
    });
  }, []);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    void api.listAccounts().then((list) => {
      if (list[0]) setAccountId(list[0].id);
    });
  }, []);

  const visibleCalIds = useMemo(
    () => new Set(calendars.filter((c) => c.visible).map((c) => c.id)),
    [calendars],
  );

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((e) => visibleCalIds.has(e.calendarId))
      .filter((e) => {
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          (e.location || "").toLowerCase().includes(q) ||
          (e.notes || "").toLowerCase().includes(q) ||
          (e.invitees || []).some((i) => i.email.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [events, visibleCalIds, query]);

  const days = useMemo(() => {
    if (calendarView === "day" || calendarView === "agenda") return [date];
    if (calendarView === "week") {
      return eachDayOfInterval({ start: startOfWeek(date), end: endOfWeek(date) });
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(date)),
      end: endOfWeek(endOfMonth(date)),
    });
  }, [calendarDate, calendarView, date]);

  const agendaDays = useMemo(() => {
    const start = startOfDay(date);
    return eachDayOfInterval({ start, end: addDays(start, 13) });
  }, [date]);

  const dayEvents = (d: Date) =>
    filteredEvents.filter((e) => isSameDay(parseISO(e.start), d));

  const colorFor = (calendarId: string) =>
    calendars.find((c) => c.id === calendarId)?.color || "#0d9488";

  const countdowns = useMemo(() => {
    const now = Date.now();
    return filteredEvents
      .filter((e) => e.countdown && +new Date(e.start) >= now)
      .slice(0, 5)
      .map((e) => ({
        event: e,
        days: differenceInCalendarDays(parseISO(e.start), new Date()),
      }));
  }, [filteredEvents]);

  const parseInvitees = (text: string): CalendarInvitee[] =>
    text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email, status: "pending" as const }));

  const beginEdit = (e: CalendarEvent) => {
    setEditingId(e.id);
    setTitle(e.title);
    setEventDate(format(parseISO(e.start), "yyyy-MM-dd"));
    setStartTime(format(parseISO(e.start), "HH:mm"));
    setEndTime(format(parseISO(e.end), "HH:mm"));
    setAllDay(Boolean(e.allDay));
    setLocation(e.location || "");
    setNotes(e.notes || "");
    setInviteesText((e.invitees || []).map((i) => i.email).join(", "));
    setTeamsUrl(e.meetingUrl || "");
    setUseTeams(e.meetingProvider === "teams" || Boolean(e.meetingUrl && /teams\.microsoft/i.test(e.meetingUrl)));
    setSelectedCalId(e.calendarId || defaultCalId);
    const mins = e.reminderMinutes?.[0];
    setReminderMinutesBefore(typeof mins === "number" ? mins : 15);
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setInviteesText("");
    setTeamsUrl("");
    setLocation("");
    setNotes("");
    setAllDay(false);
    setStartTime(defaultStartTime());
    setEndTime(addOneHour(defaultStartTime()));
    setEventDate(calendarDate);
    setSelectedCalId(defaultCalId);
    setReminderMinutesBefore(15);
    setUseTeams(false);
  };

  const saveEvent = async () => {
    if (!title.trim()) {
      setToast("Add an event title");
      return;
    }
    if (!eventDate) {
      setToast("Date is required");
      return;
    }
    let start: Date;
    let end: Date;
    if (allDay) {
      start = startOfDay(parseISO(eventDate));
      end = endOfDay(parseISO(eventDate));
    } else {
      if (!startTime || !endTime) {
        setToast("Start and end time are required");
        return;
      }
      start = parseISO(`${eventDate}T${startTime}:00`);
      end = parseISO(`${eventDate}T${endTime}:00`);
      if (Number.isNaN(+start) || Number.isNaN(+end)) {
        setToast("Invalid date or time");
        return;
      }
      if (end <= start) {
        setToast("End time must be after start time");
        return;
      }
    }
    const invitees = parseInvitees(inviteesText);
    let meetingUrl = teamsUrl.trim();
    let meetingProvider: "teams" | "zoom" | "meet" | "none" = "none";
    if (/zoom\.us/i.test(meetingUrl)) meetingProvider = "zoom";
    else if (/meet\.google/i.test(meetingUrl)) meetingProvider = "meet";
    else if (/teams\.microsoft|teams\.live/i.test(meetingUrl)) meetingProvider = "teams";
    else if (meetingUrl) meetingProvider = "teams";

    if (useTeams) {
      if (!teamsInstalled) {
        setToast("Microsoft Teams is not installed — install Teams and sign in with your account.");
        return;
      }
      if (!meetingUrl) {
        setToast("Open Teams to create the meeting, then paste your Join link here.");
        return;
      }
      if (!/teams\.microsoft|teams\.live/i.test(meetingUrl)) {
        setToast("Paste a real Teams join link from your Microsoft Teams meeting.");
        return;
      }
      meetingProvider = "teams";
    }
    const payload = {
      title: title.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      calendarId: selectedCalId || defaultCalId,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      reminderMinutes: reminderMinutesBefore < 0 ? [] : [reminderMinutesBefore],
      invitees,
      meetingUrl: meetingUrl || undefined,
      meetingProvider,
      source: "local" as const,
    };
    if (editingId) {
      updateEvent(editingId, payload);
      setToast("Event updated");
    } else {
      addEvent(payload);
      setToast("Event added — use Email invites to notify people");
    }
    resetForm();
  };

  const shiftDate = (dir: -1 | 1) => {
    if (calendarView === "month") setCalendarDate(format(addMonths(date, dir), "yyyy-MM-dd"));
    else if (calendarView === "week" || calendarView === "agenda")
      setCalendarDate(format(addDays(date, dir * 7), "yyyy-MM-dd"));
    else setCalendarDate(format(addDays(date, dir), "yyyy-MM-dd"));
  };

  const renderTimedGrid = (dayList: Date[]) => (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white/90">
      <div
        className="grid min-w-[640px]"
        style={{ gridTemplateColumns: `56px repeat(${dayList.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-line bg-soft/50 p-2 text-[10px] text-muted">Time</div>
        {dayList.map((d) => (
          <button
            key={format(d, "yyyy-MM-dd")}
            type="button"
            onClick={() => setCalendarDate(format(d, "yyyy-MM-dd"))}
            className={`border-b border-l border-line p-2 text-left text-xs font-semibold ${
              isSameDay(d, date) ? "bg-[#ecfdf8] text-teal" : "bg-soft/40"
            }`}
          >
            {format(d, "EEE d")}
            {isToday(d) ? <span className="ml-1 text-[10px] font-normal">· today</span> : null}
          </button>
        ))}
        {HOURS.map((hour) => (
          <div key={`row-${hour}`} className="contents">
            <div className="border-b border-line px-1 py-3 text-[10px] text-muted">
              {format(new Date(2000, 0, 1, hour), "h a")}
            </div>
            {dayList.map((d) => {
              const key = `${format(d, "yyyy-MM-dd")}-${hour}`;
              const slotEvents = dayEvents(d).filter((e) => {
                if (e.allDay) return false;
                return parseISO(e.start).getHours() === hour;
              });
              return (
                <button
                  key={key}
                  type="button"
                  className="min-h-14 border-b border-l border-line p-1 text-left hover:bg-soft/50"
                  onClick={() => {
                    setCalendarDate(format(d, "yyyy-MM-dd"));
                    setEventDate(format(d, "yyyy-MM-dd"));
                    setStartTime(`${String(hour).padStart(2, "0")}:00`);
                    setEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                    setEditingId(null);
                    setToast(`New event at ${format(new Date(2000, 0, 1, hour), "h a")}`);
                  }}
                >
                  <ul className="space-y-0.5">
                    {slotEvents.map((e) => (
                      <li key={e.id}>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            beginEdit(e);
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") beginEdit(e);
                          }}
                          className="block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                          style={{ background: colorFor(e.calendarId) }}
                          title={e.title}
                        >
                          {format(parseISO(e.start), "h:mm")} {e.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="px-4 py-6 md:px-8">
      <SectionHeader
        title="Calendar"
        subtitle="Day · week · month · agenda — Teams/Zoom invites, Mac sync, habits, journal, and countdowns."
        actions={
          <>
            {(["day", "week", "month", "agenda"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={calendarView === v ? "primary" : "soft"}
                onClick={() => setCalendarView(v)}
              >
                {v}
              </Button>
            ))}
            <Button size="sm" variant="soft" onClick={() => shiftDate(-1)}>
              ←
            </Button>
            <Button size="sm" variant="soft" onClick={() => setCalendarDate(format(new Date(), "yyyy-MM-dd"))}>
              Today
            </Button>
            <Button size="sm" variant="soft" onClick={() => shiftDate(1)}>
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search events, places, people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-xs text-muted">Primary TZ: {settings.timezone}</span>
        {settings.secondaryTimezone ? (
          <span className="text-xs text-muted">Secondary: {settings.secondaryTimezone}</span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {calendars.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCalendarVisible(c.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold text-white transition ${
                c.visible ? "opacity-100" : "opacity-35 grayscale"
              }`}
              style={{ background: c.color }}
              title={c.visible ? "Hide calendar" : "Show calendar"}
            >
              {c.source === "mac" ? "Mac · " : ""}
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {countdowns.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {countdowns.map(({ event: e, days: d }) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setCalendarDate(format(parseISO(e.start), "yyyy-MM-dd"));
                beginEdit(e);
              }}
              className="rounded-xl border border-teal/30 bg-[#ecfdf8] px-3 py-2 text-left text-sm"
            >
              <span className="font-semibold text-teal">
                {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`}
              </span>
              <span className="ml-2 text-ink">{e.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      {calendarView === "month" ? (
        <div className="mb-6 grid grid-cols-7 gap-2">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const label = dayLabels.find((x) => x.date === key)?.label;
            const selected = isSameDay(d, date);
            const allDayCount = dayEvents(d).filter((e) => e.allDay).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCalendarDate(key)}
                className={`min-h-28 rounded-2xl border p-2 text-left transition ${
                  selected ? "border-teal bg-[#ecfdf8]" : "border-line bg-white/85 hover:bg-soft/60"
                } ${!isSameMonth(d, date) ? "opacity-40" : ""} ${isToday(d) ? "ring-1 ring-teal/40" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold">{format(d, "d")}</span>
                  {label ? <span className="truncate text-[10px] text-teal">{label}</span> : null}
                </div>
                {allDayCount ? (
                  <div className="mb-1 text-[10px] font-medium text-muted">{allDayCount} all-day</div>
                ) : null}
                <ul className="space-y-1">
                  {dayEvents(d)
                    .slice(0, 3)
                    .map((e) => (
                      <li
                        key={e.id}
                        className="truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                        style={{ background: colorFor(e.calendarId) }}
                        title={e.title}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          beginEdit(e);
                        }}
                      >
                        {e.allDay ? "" : `${format(parseISO(e.start), "h:mma")} `}
                        {e.title}
                      </li>
                    ))}
                </ul>
              </button>
            );
          })}
        </div>
      ) : null}

      {calendarView === "week" || calendarView === "day" ? (
        <div className="mb-6">{renderTimedGrid(calendarView === "day" ? [date] : days)}</div>
      ) : null}

      {calendarView === "agenda" ? (
        <div className="mb-6 space-y-3">
          {agendaDays.map((d) => {
            const list = dayEvents(d);
            if (!list.length && !isSameDay(d, date)) return null;
            return (
              <section key={format(d, "yyyy-MM-dd")} className="rounded-2xl border border-line bg-white/90 p-4">
                <button
                  type="button"
                  className="mb-2 text-left font-display text-lg"
                  onClick={() => setCalendarDate(format(d, "yyyy-MM-dd"))}
                >
                  {format(d, "EEEE, MMM d")}
                  {isToday(d) ? <span className="ml-2 text-sm font-sans text-teal">Today</span> : null}
                </button>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">Nothing scheduled.</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => beginEdit(e)}
                          className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-soft/50"
                        >
                          <span
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{ background: colorFor(e.calendarId) }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{e.title}</div>
                            <div className="text-sm text-muted">
                              {e.allDay
                                ? "All day"
                                : `${format(parseISO(e.start), "h:mm a")} – ${format(parseISO(e.end), "h:mm a")}`}
                              {e.location ? ` · ${e.location}` : ""}
                              {settings.secondaryTimezone && !e.allDay
                                ? ` · ${formatInTz(e.start, settings.secondaryTimezone)} ${settings.secondaryTimezone}`
                                : ""}
                            </div>
                          </div>
                          <span className="text-xs text-muted">
                            {differenceInMinutes(parseISO(e.end), parseISO(e.start))}m
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white/90 p-4 lg:col-span-2">
          <h3 className="mb-3 font-display text-xl">
            {editingId ? "Edit event" : `Events on ${format(date, "MMMM d")}`}
          </h3>
          {!editingId ? (
            <ul className="mb-4 space-y-3">
              {dayEvents(date).map((e) => (
                <li key={e.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: colorFor(e.calendarId) }}
                        />
                        {e.title}
                        {e.source === "mac" ? (
                          <span className="ml-2 text-xs font-normal text-muted">Mac</span>
                        ) : null}
                        {e.allDay ? (
                          <span className="ml-2 text-xs font-normal text-muted">All day</span>
                        ) : null}
                      </div>
                      <div className="text-sm text-muted">
                        {e.allDay
                          ? "All day"
                          : `${format(parseISO(e.start), "h:mm a")} – ${format(parseISO(e.end), "h:mm a")}`}
                        {e.location ? ` · ${e.location}` : ""}
                      </div>
                      {e.meetingUrl ? (
                        <a
                          className="text-sm text-teal underline"
                          href={e.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.meetingProvider === "teams"
                            ? "Join Teams meeting"
                            : e.meetingProvider === "zoom"
                              ? "Join Zoom"
                              : "Join meeting"}
                        </a>
                      ) : null}
                      {e.invitees?.length ? (
                        <p className="mt-1 text-xs text-muted">
                          Invitees: {e.invitees.map((i) => i.email).join(", ")}
                          {e.invitesSentAt
                            ? ` · sent ${format(parseISO(e.invitesSentAt), "MMM d h:mm a")}`
                            : ""}
                        </p>
                      ) : null}
                      {e.notes ? <p className="mt-1 text-xs text-muted">{e.notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="soft" onClick={() => beginEdit(e)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="soft" onClick={() => updateEvent(e.id, { countdown: !e.countdown })}>
                        {e.countdown ? "Countdown ✓" : "Countdown"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicateEvent(e.id)}>
                        Duplicate
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
                      {e.source !== "mac" ? (
                        <Button size="sm" variant="ghost" onClick={() => deleteEvent(e.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
              {dayEvents(date).length === 0 ? (
                <li className="text-sm text-muted">No events yet — create one below or click a time slot.</li>
              ) : null}
            </ul>
          ) : null}

          <form
            className="space-y-2 rounded-xl border border-teal/25 bg-[linear-gradient(145deg,#ecfdf8_0%,#f0f9ff_55%,#fff7ed_100%)] p-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              void saveEvent();
            }}
          >
            <h4 className="text-sm font-semibold text-ink">
              {editingId ? "Update event" : "New event"}
            </h4>
            <Input placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted">
                Calendar
                <select
                  className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={selectedCalId || defaultCalId}
                  onChange={(e) => setSelectedCalId(e.target.value)}
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.source === "mac" ? " (Mac)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted">
                Reminder
                <select
                  className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={reminderMinutesBefore}
                  onChange={(e) => setReminderMinutesBefore(Number(e.target.value))}
                >
                  <option value={-1}>None</option>
                  <option value={0}>At event time</option>
                  <option value={5}>5 minutes before</option>
                  <option value={15}>15 minutes before</option>
                  <option value={30}>30 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                All-day event
              </label>
            </div>
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
              {!allDay ? (
                <>
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
                </>
              ) : null}
            </div>
            <Input
              placeholder="Location or address"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="Invitee emails (comma or newline separated)"
              value={inviteesText}
              onChange={(e) => setInviteesText(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useTeams}
                disabled={teamsInstalled === false}
                onChange={(e) => setUseTeams(e.target.checked)}
              />
              Create Microsoft Teams meeting (your account)
            </label>
            {teamsInstalled === false ? (
              <p className="text-xs text-amber-800">
                Microsoft Teams is not installed on this computer. Install Teams, sign in with your Microsoft account,
                then you can create meetings here. You can still paste a Zoom / Meet / Teams link below.
              </p>
            ) : null}
            {useTeams && teamsInstalled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  disabled={openingTeams || !title.trim()}
                  onClick={() => {
                    void (async () => {
                      const api = desktopApi();
                      if (!api?.openTeamsMeeting) {
                        setToast("Open Envision Mail desktop to use Teams on this computer.");
                        return;
                      }
                      if (!title.trim()) {
                        setToast("Add an event title first");
                        return;
                      }
                      setOpeningTeams(true);
                      try {
                        let startIso: string;
                        let endIso: string;
                        if (allDay) {
                          startIso = startOfDay(parseISO(eventDate)).toISOString();
                          endIso = endOfDay(parseISO(eventDate)).toISOString();
                        } else {
                          startIso = parseISO(`${eventDate}T${startTime}:00`).toISOString();
                          endIso = parseISO(`${eventDate}T${endTime}:00`).toISOString();
                        }
                        const res = await api.openTeamsMeeting({
                          title: title.trim(),
                          startIso,
                          endIso,
                        });
                        if (!res.ok) {
                          setToast(res.error || "Could not open Teams");
                          if (res.installed === false) setTeamsInstalled(false);
                          return;
                        }
                        setToast(res.message || "Create the meeting in Teams, then paste the Join link below.");
                      } finally {
                        setOpeningTeams(false);
                      }
                    })();
                  }}
                >
                  {openingTeams ? "Opening Teams…" : "Open Teams to create meeting"}
                </Button>
                <span className="text-xs text-muted">Uses the Teams account signed in on this Mac/PC.</span>
              </div>
            ) : null}
            <Input
              placeholder={
                useTeams
                  ? "Paste your Teams Join link here"
                  : "Or paste Teams / Zoom / Meet URL"
              }
              value={teamsUrl}
              onChange={(e) => setTeamsUrl(e.target.value)}
            />
            {isDesktop() && accountId ? (
              <p className="text-xs text-muted">
                Invites send from your connected SMTP account after the event is saved.
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                Connect an IMAP/SMTP account in Settings to email calendar invites.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{editingId ? "Save changes" : "Add event"}</Button>
              {editingId ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
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
              {habits.length === 0 ? (
                <p className="text-xs text-muted">Add habits from Settings or seed later — track daily wins here.</p>
              ) : null}
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
            <p className="mb-2 text-xs text-muted">
              Check off to clear. Unfinished tasks roll into next week automatically.
            </p>
            <ul className="mb-2 space-y-1 text-sm">
              {sometimeTasks
                .filter((t) => !t.done)
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleSometimeTask(t.id)}
                      aria-label={`Complete ${t.text}`}
                    />
                    <span>{t.text}</span>
                    {t.carriedOver ? (
                      <span className="rounded bg-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Rolled over
                      </span>
                    ) : null}
                  </li>
                ))}
              {sometimeTasks.filter((t) => !t.done).length === 0 ? (
                <li className="text-sm text-muted">Nothing queued — add a task below.</li>
              ) : null}
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
