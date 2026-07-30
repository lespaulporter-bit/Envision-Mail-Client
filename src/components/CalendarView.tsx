"use client";

import { CalendarTimezoneClocks } from "@/components/CalendarTimezoneClocks";
import { Button, Input, Textarea } from "@/components/ui";
import { desktopApi, isDesktop } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import type { CalendarEvent, CalendarInvitee } from "@/lib/types";
import { formatLocalHhmmInZone, localTimezoneId } from "@/lib/timezones";
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
  differenceInMinutes,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_EVENT_DURATION_MINUTES,
  addMinutesHhmm,
  defaultStartTimeHhmm,
  endAfterStartChange,
  setTimePeriod,
  timePeriod,
} from "@/lib/event-time";
import { formatCountdown, isFakeMeetingUrl, sanitizeMeetingUrl } from "@/lib/utils";
import { JoinMeetingLink, LinkifiedText } from "@/components/MeetingLink";
import { Video } from "lucide-react";
import { detectMeetingProvider, findMeetingUrl, resolveMeetingLink } from "@/lib/meeting-links";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am–8pm

function TimePeriodToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const selected = timePeriod(value);
  return (
    <span className="mt-1 flex w-fit overflow-hidden rounded-md border border-line bg-white">
      {(["AM", "PM"] as const).map((period) => (
        <button
          key={period}
          type="button"
          className={`px-2 py-1 text-[10px] font-bold transition ${
            selected === period ? "bg-teal text-white" : "text-muted hover:bg-soft"
          }`}
          onClick={() => onChange(setTimePeriod(value, period))}
          aria-pressed={selected === period}
          title={`Set time to ${period}`}
        >
          {period}
        </button>
      ))}
    </span>
  );
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

  const eventDurationMinutes = Math.max(
    5,
    settings.defaultEventDurationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES,
  );
  const date = parseISO(calendarDate);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(calendarDate);
  const [startTime, setStartTime] = useState(defaultStartTimeHhmm);
  const [endTime, setEndTime] = useState(() =>
    addMinutesHhmm(defaultStartTimeHhmm(), DEFAULT_EVENT_DURATION_MINUTES),
  );
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
  const [notifyRecipients, setNotifyRecipients] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [syncingMac, setSyncingMac] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [journalDraft, setJournalDraft] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Main "New event" composer — collapsed until the user expands or edits */
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [selectedCalId, setSelectedCalId] = useState("");
  /** yyyy-MM-dd when the day events popup is open */
  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);
  const [daySheetCompose, setDaySheetCompose] = useState(false);
  const dayClickTimerRef = useRef<number | null>(null);
  /** Live clock for countdown chips */
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** Minutes before start — 0 = at start time; -1 = none */
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(
    () => settings.defaultEventReminderMinutes ?? 15,
  );
  const isMacDesktop = isDesktop() && desktopApi()?.platform === "darwin";

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  /** The month / week / day you are actually looking at, spelled out. */
  const periodLabel = useMemo(() => {
    if (calendarView === "month") return format(date, "MMMM yyyy");
    if (calendarView === "week") {
      const start = startOfWeek(date);
      const end = endOfWeek(date);
      return isSameMonth(start, end)
        ? `${format(start, "MMMM d")} – ${format(end, "d, yyyy")}`
        : `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    if (calendarView === "agenda") {
      return `${format(date, "MMM d")} – ${format(addDays(date, 13), "MMM d, yyyy")}`;
    }
    return format(date, "EEEE, MMMM d, yyyy");
  }, [calendarView, date]);

  const stepNoun =
    calendarView === "month" ? "month" : calendarView === "day" ? "day" : "week";
  const viewingNow =
    calendarView === "month" ? isSameMonth(date, new Date()) : days.some((d) => isToday(d));

  const dayEvents = (d: Date) =>
    filteredEvents.filter((e) => isSameDay(parseISO(e.start), d));

  // The popup is a complete day view: search text and hidden-calendar filters
  // must not conceal an appointment that is already scheduled.
  const daySheetEvents = useMemo(() => {
    if (!daySheetDate) return [];
    const sheetDate = parseISO(daySheetDate);
    return events
      .filter((event) => isSameDay(parseISO(event.start), sheetDate))
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [daySheetDate, events]);

  const colorFor = (calendarId: string) =>
    calendars.find((c) => c.id === calendarId)?.color || "#0d9488";

  const countdowns = useMemo(() => {
    return filteredEvents
      .filter((e) => e.countdown && +new Date(e.start) >= nowMs)
      .sort((a, b) => +new Date(a.start) - +new Date(b.start))
      .slice(0, 5)
      .map((e) => ({
        event: e,
        cd: formatCountdown(e.start, nowMs),
      }));
  }, [filteredEvents, nowMs]);

  const parseInvitees = (text: string): CalendarInvitee[] => {
    const existing = editingId ? events.find((event) => event.id === editingId)?.invitees || [] : [];
    const existingByEmail = new Map(existing.map((invitee) => [invitee.email.toLowerCase(), invitee]));
    const unique = new Map<string, string>();
    text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((email) => unique.set(email.toLowerCase(), email));
    return [...unique.entries()].map(([key, email]) => existingByEmail.get(key) || {
      email,
      status: "pending" as const,
    });
  };

  const openDaySheet = (ymd: string, opts?: { compose?: boolean; edit?: CalendarEvent }) => {
    setCalendarDate(ymd);
    setEventDate(ymd);
    setDaySheetDate(ymd);
    if (opts?.edit) {
      beginEdit(opts.edit);
      // The day sheet owns this edit; do not leave the hidden page composer open.
      setEventFormOpen(false);
      setDaySheetCompose(true);
      return;
    }
    if (opts?.compose) {
      setEditingId(null);
      setTitle("");
      setInviteesText("");
      setTeamsUrl("");
      setLocation("");
      setNotes("");
      setAllDay(false);
      const start = defaultStartTimeHhmm();
      setStartTime(start);
      setEndTime(addMinutesHhmm(start, eventDurationMinutes));
      setSelectedCalId(defaultCalId);
      setReminderMinutesBefore(settings.defaultEventReminderMinutes ?? 15);
      setUseTeams(false);
      setNotifyRecipients(true);
      setDaySheetCompose(true);
      return;
    }
    setDaySheetCompose(false);
  };

  const cancelPendingDayClick = () => {
    if (dayClickTimerRef.current !== null) {
      window.clearTimeout(dayClickTimerRef.current);
      dayClickTimerRef.current = null;
    }
  };

  const openDaySheetOnSingleClick = (ymd: string) => {
    cancelPendingDayClick();
    // Wait just long enough to distinguish a single click from a double-click.
    // This preserves the existing single-click popup and makes double-click reliable.
    dayClickTimerRef.current = window.setTimeout(() => {
      dayClickTimerRef.current = null;
      openDaySheet(ymd);
    }, 220);
  };

  const openDaySheetOnDoubleClick = (ymd: string) => {
    cancelPendingDayClick();
    openDaySheet(ymd);
  };

  const closeDaySheet = () => {
    // Leaving mid-compose must not strand the page composer in edit mode.
    setEditingId(null);
    setEventFormOpen(false);
    setDaySheetDate(null);
    setDaySheetCompose(false);
  };

  useEffect(() => {
    if (!daySheetDate) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeDaySheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [daySheetDate]);

  useEffect(
    () => () => {
      cancelPendingDayClick();
    },
    [],
  );

  const beginEdit = (e: CalendarEvent) => {
    setEventFormOpen(true);
    setEditingId(e.id);
    setTitle(e.title);
    setEventDate(format(parseISO(e.start), "yyyy-MM-dd"));
    setStartTime(format(parseISO(e.start), "HH:mm"));
    setEndTime(format(parseISO(e.end), "HH:mm"));
    setAllDay(Boolean(e.allDay));
    setLocation(e.location || "");
    setNotes(e.notes || "");
    setInviteesText((e.invitees || []).map((i) => i.email).join(", "));
    const realUrl = sanitizeMeetingUrl(e.meetingUrl || "");
    setTeamsUrl(realUrl);
    setUseTeams(
      e.meetingProvider === "teams" || Boolean(realUrl && /teams\.microsoft|teams\.live/i.test(realUrl)),
    );
    setSelectedCalId(e.calendarId || defaultCalId);
    const mins = e.reminderMinutes?.[0];
    setReminderMinutesBefore(
      typeof mins === "number" ? mins : e.reminderMinutes?.length === 0 ? -1 : 15,
    );
    setNotifyRecipients(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setEventFormOpen(false);
    setTitle("");
    setInviteesText("");
    setTeamsUrl("");
    setLocation("");
    setNotes("");
    setAllDay(false);
    const start = defaultStartTimeHhmm();
    setStartTime(start);
    setEndTime(addMinutesHhmm(start, eventDurationMinutes));
    setEventDate(daySheetDate || calendarDate);
    setSelectedCalId(defaultCalId);
    setReminderMinutesBefore(settings.defaultEventReminderMinutes ?? 15);
    setUseTeams(false);
    setNotifyRecipients(true);
    setDaySheetCompose(false);
  };

  const startNewEvent = (ymd = calendarDate, suggestedStart?: string) => {
    setEditingId(null);
    setTitle("");
    setInviteesText("");
    setTeamsUrl("");
    setLocation("");
    setNotes("");
    setAllDay(false);
    const start = suggestedStart || defaultStartTimeHhmm();
    setStartTime(start);
    setEndTime(addMinutesHhmm(start, eventDurationMinutes));
    setEventDate(ymd);
    setSelectedCalId(defaultCalId);
    setReminderMinutesBefore(settings.defaultEventReminderMinutes ?? 15);
    setUseTeams(false);
    setNotifyRecipients(true);
    setDaySheetCompose(false);
    setEventFormOpen(true);
  };

  const openTeamsForDraft = async () => {
    const api = desktopApi();
    if (!api?.openTeamsMeeting) {
      setToast("Open Envision Mail desktop to use Teams on this computer.");
      return;
    }
    if (!eventDate || (!allDay && (!startTime || !endTime))) {
      setToast("Choose the event date and time before opening Teams.");
      return;
    }
    let startIso: string;
    let endIso: string;
    if (allDay) {
      startIso = startOfDay(parseISO(eventDate)).toISOString();
      endIso = endOfDay(parseISO(eventDate)).toISOString();
    } else {
      const start = parseISO(`${eventDate}T${startTime}:00`);
      const end = parseISO(`${eventDate}T${endTime}:00`);
      if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
        setToast("Choose an end time after the start time before opening Teams.");
        return;
      }
      startIso = start.toISOString();
      endIso = end.toISOString();
    }

    setOpeningTeams(true);
    try {
      const res = await api.openTeamsMeeting({
        title: title.trim() || "Meeting",
        startIso,
        endIso,
      });
      if (!res.ok) {
        setToast(res.error || "Could not open Teams");
        if (res.installed === false) setTeamsInstalled(false);
        return;
      }
      if (res.installed) setTeamsInstalled(true);
      // Teams owns meeting creation; never invent or auto-fill a Join URL.
      setTeamsUrl("");
      setToast(res.message || "Create the meeting in Teams, then paste the Join link below.");
    } finally {
      setOpeningTeams(false);
    }
  };

  const emailEventInvites = async (event: CalendarEvent) => {
    if (!event.invitees?.length) {
      setToast("Add at least one recipient first");
      return;
    }
    const api = desktopApi();
    if (!api?.sendCalendarInvites || !accountId) {
      setToast("Connect an email account in Settings to notify recipients.");
      return;
    }
    setSendingInviteId(event.id);
    try {
      const result = await api.sendCalendarInvites({ accountId, event });
      if (!result?.ok) {
        setToast(result?.error || "Invite send failed");
        return;
      }
      updateEvent(event.id, { invitesSentAt: new Date().toISOString() });
      setToast(
        `Notification emailed to ${event.invitees.length} recipient${
          event.invitees.length === 1 ? "" : "s"
        }`,
      );
    } finally {
      setSendingInviteId(null);
    }
  };

  const saveEvent = async () => {
    if (savingEvent) return;
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
    const rawInvitees = inviteesText
      .split(/[,;\n]+/)
      .map((email) => email.trim())
      .filter(Boolean);
    const invalidInvitee = rawInvitees.find(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    );
    if (invalidInvitee) {
      setToast(`Check this recipient email: ${invalidInvitee}`);
      return;
    }
    const invitees = parseInvitees(inviteesText);
    const pastedUrl = sanitizeMeetingUrl(teamsUrl);
    if (teamsUrl.trim() && isFakeMeetingUrl(teamsUrl)) {
      setToast("That looks like an example link — paste a real Join link from Teams (never auto-filled).");
      setTeamsUrl("");
      return;
    }
    // A join link typed into Location or Notes still becomes the event's meeting link.
    const meetingUrl = pastedUrl || findMeetingUrl(location) || findMeetingUrl(notes);
    let meetingProvider = detectMeetingProvider(meetingUrl);

    if (useTeams) {
      if (!meetingUrl) {
        setToast("Open Teams to create the meeting, then paste your real Join link here.");
        return;
      }
      if (meetingProvider !== "teams") {
        setToast("Paste a real Teams join link from your Microsoft Teams meeting.");
        setTeamsUrl("");
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
    setSavingEvent(true);
    try {
      let savedEvent: CalendarEvent;
      if (editingId) {
        const existing = events.find((event) => event.id === editingId);
        if (!existing) {
          setToast("Event no longer exists");
          return;
        }
        // Anything a recipient would care about invalidates an earlier "invites sent" stamp.
        const inviteDetailsChanged =
          existing.title !== payload.title ||
          existing.start !== payload.start ||
          existing.end !== payload.end ||
          Boolean(existing.allDay) !== payload.allDay ||
          (existing.location || "") !== (payload.location || "") ||
          (existing.meetingUrl || "") !== (payload.meetingUrl || "") ||
          (existing.invitees || []).map((i) => i.email).join(",") !==
            invitees.map((i) => i.email).join(",");
        const patch = {
          ...payload,
          // Never convert an imported Mac event into a local copy — that duplicates it on next sync.
          source: existing.source ?? "local",
          ...(inviteDetailsChanged ? { invitesSentAt: null } : {}),
        };
        savedEvent = { ...existing, ...patch, id: editingId };
        updateEvent(editingId, patch);
      } else {
        savedEvent = addEvent(payload);
      }

      if (notifyRecipients && invitees.length > 0) {
        const api = desktopApi();
        if (!api?.sendCalendarInvites || !accountId) {
          setToast("Event saved — connect an email account in Settings to notify recipients.");
        } else {
          setSendingInviteId(savedEvent.id);
          const result = await api.sendCalendarInvites({ accountId, event: savedEvent });
          if (!result?.ok) {
            setToast(result?.error || "Event saved, but recipient email failed");
          } else {
            const sentAt = new Date().toISOString();
            updateEvent(savedEvent.id, { invitesSentAt: sentAt });
            setToast(
              `Event saved · notification emailed to ${invitees.length} recipient${
                invitees.length === 1 ? "" : "s"
              }`,
            );
          }
        }
      } else if (invitees.length > 0) {
        setToast("Event saved without emailing recipients");
      } else {
        setToast(editingId ? "Event updated" : "Event added");
      }

      resetForm();
      // Stay on the day sheet list after save so the new/updated event is visible
      if (daySheetDate) setDaySheetCompose(false);
    } finally {
      setSavingEvent(false);
      setSendingInviteId(null);
    }
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
            onClick={() => openDaySheetOnSingleClick(format(d, "yyyy-MM-dd"))}
            onDoubleClick={() => openDaySheetOnDoubleClick(format(d, "yyyy-MM-dd"))}
            className={`border-b border-l border-line p-2 text-left text-xs font-semibold ${
              isSameDay(d, date) || daySheetDate === format(d, "yyyy-MM-dd")
                ? "bg-[#ecfdf8] text-teal"
                : "bg-soft/40 hover:bg-soft"
            }`}
            title="Open all events for this day"
          >
            {format(d, "EEE, MMM d")}
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
                    const start = `${String(hour).padStart(2, "0")}:00`;
                    const ymd = format(d, "yyyy-MM-dd");
                    setCalendarDate(ymd);
                    startNewEvent(ymd, start);
                    setToast(`New event at ${format(new Date(2000, 0, 1, hour), "h:mm a")}`);
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
                          {resolveMeetingLink(e) ? (
                            <Video className="mr-1 inline-block h-2.5 w-2.5 align-[-1px]" aria-label="Has a meeting link" />
                          ) : null}
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

  const primaryZone = settings.timezone || localTimezoneId();
  const secondaryZone = settings.secondaryTimezone || "America/Los_Angeles";
  const dualZones = Boolean(settings.showDualCalendarTimezones);

  const eventZoneHint = (hhmm: string) => {
    if (!dualZones || !hhmm || !eventDate || allDay) return null;
    // Event time pickers use the Mac’s local wall clock
    const source = localTimezoneId();
    const a = formatLocalHhmmInZone(eventDate, hhmm, source, primaryZone);
    const b = formatLocalHhmmInZone(eventDate, hhmm, source, secondaryZone);
    if (!a && !b) return null;
    // Same zone twice (e.g. primary = local) — show one line only
    if (a && b && a === b) {
      return (
        <p className="mb-1 text-[11px] leading-snug text-muted">
          <span className="font-medium text-ink">{a}</span>
        </p>
      );
    }
    return (
      <p className="mb-1 text-[11px] leading-snug text-muted">
        <span className="font-medium text-ink">{a}</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span className="font-medium text-ink">{b}</span>
      </p>
    );
  };

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-3xl tracking-tight text-ink">Calendar</h1>
            <CalendarTimezoneClocks
              primaryZone={primaryZone}
              secondaryZone={secondaryZone}
              dual={dualZones}
            />
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Day · week · month · agenda — Teams/Zoom invites, Mac sync, habits, journal, and countdowns.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search events, places, people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
          {countdowns.map(({ event: e, cd }) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setCalendarDate(format(parseISO(e.start), "yyyy-MM-dd"));
                beginEdit(e);
              }}
              className="rounded-xl border border-teal/25 bg-[#ecfdf8]/90 px-3 py-2 text-left text-sm transition hover:border-teal/40"
              title={format(parseISO(e.start), "EEE, MMM d · h:mm a")}
            >
              <span
                className={`font-mono text-xs tracking-tight ${
                  cd.urgent ? "text-amber-700" : "text-teal/80"
                }`}
              >
                {cd.label}
              </span>
              <span className="ml-2 text-ink">{e.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/85 px-3 py-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="soft" onClick={() => shiftDate(-1)} title={`Previous ${stepNoun}`}>
            ←
          </Button>
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl leading-tight tracking-tight text-ink">
              {periodLabel}
            </h2>
            <p className="text-[11px] text-muted">
              {viewingNow
                ? `Includes today · ${format(new Date(), "EEE, MMM d, yyyy")}`
                : `Today is ${format(new Date(), "EEE, MMM d, yyyy")}`}
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={() => shiftDate(1)} title={`Next ${stepNoun}`}>
            →
          </Button>
        </div>
        <Button
          size="sm"
          variant={viewingNow ? "soft" : "primary"}
          onClick={() => setCalendarDate(format(new Date(), "yyyy-MM-dd"))}
        >
          Today
        </Button>
      </div>

      {calendarView === "month" ? (
        <div className="mb-6">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {days.slice(0, 7).map((d) => (
              <div
                key={`weekday-${format(d, "i")}`}
                className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
              >
                {format(d, "EEE")}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const label = dayLabels.find((x) => x.date === key)?.label;
              const selected = isSameDay(d, date);
              const list = dayEvents(d);
              const allDayCount = list.filter((e) => e.allDay).length;
              const overflow = Math.max(0, list.length - 3);
              const otherMonth = !isSameMonth(d, date);
              return (
                <button
                  key={key}
                  type="button"
                onClick={() => openDaySheetOnSingleClick(key)}
                onDoubleClick={() => openDaySheetOnDoubleClick(key)}
                  className={`min-h-28 rounded-2xl border p-2 text-left transition ${
                    selected || daySheetDate === key
                      ? "border-teal bg-[#ecfdf8]"
                      : otherMonth
                        ? "border-line/70 bg-soft/50 hover:bg-soft"
                        : "border-line bg-white/85 hover:bg-soft/60"
                  } ${isToday(d) ? "ring-1 ring-teal/40" : ""}`}
                title={`${format(d, "EEEE, MMMM d, yyyy")} · click or double-click to open day`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={`font-semibold ${otherMonth ? "text-muted" : ""}`}>
                      {/* Month name on the 1st and on spill-over days, so no date is ambiguous */}
                      {d.getDate() === 1 || otherMonth ? format(d, "MMM d") : format(d, "d")}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      {label ? <span className="truncate text-[10px] text-teal">{label}</span> : null}
                      {isToday(d) ? (
                        <span className="shrink-0 rounded-full bg-teal px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                          Today
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {allDayCount ? (
                    <div className="mb-1 text-[10px] font-medium text-muted">{allDayCount} all-day</div>
                  ) : null}
                  <ul className="space-y-1">
                    {list.slice(0, 3).map((e) => (
                      <li
                        key={e.id}
                        className="truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                        style={{ background: colorFor(e.calendarId) }}
                        title={e.title}
                        onClick={(ev) => {
                          ev.stopPropagation();
                        cancelPendingDayClick();
                          openDaySheet(key, { edit: e });
                        }}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      >
                        {resolveMeetingLink(e) ? (
                          <Video className="mr-1 inline-block h-3 w-3 align-[-2px]" aria-label="Has a meeting link" />
                        ) : null}
                        {e.allDay ? "" : `${format(parseISO(e.start), "h:mma")} `}
                        {e.title}
                      </li>
                    ))}
                  </ul>
                  {overflow > 0 ? (
                    <div className="mt-1 text-[10px] font-medium text-teal">+{overflow} more · open day</div>
                  ) : list.length === 0 ? (
                    <div className="mt-1 text-[10px] text-muted">Click to add</div>
                  ) : (
                    <div className="mt-1 text-[10px] text-muted">Click for all</div>
                  )}
                </button>
              );
            })}
          </div>
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
                  className="mb-2 text-left font-display text-lg hover:text-teal"
                  onClick={() => openDaySheetOnSingleClick(format(d, "yyyy-MM-dd"))}
                  onDoubleClick={() => openDaySheetOnDoubleClick(format(d, "yyyy-MM-dd"))}
                  title="Click or double-click — all events, add, or edit"
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
                              {dualZones && secondaryZone && !e.allDay
                                ? ` · ${formatInTz(e.start, secondaryZone)}`
                                : ""}
                            </div>
                          </div>
                          <span className="text-xs text-muted">
                            {differenceInMinutes(parseISO(e.end), parseISO(e.start))}m
                          </span>
                        </button>
                        {resolveMeetingLink(e) ? (
                          <div className="mt-1 pl-6">
                            <JoinMeetingLink link={resolveMeetingLink(e)!} compact />
                          </div>
                        ) : null}
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
                      {e.countdown && +new Date(e.start) >= nowMs ? (
                        <div
                          className={`mt-0.5 font-mono text-xs tracking-tight ${
                            formatCountdown(e.start, nowMs).urgent ? "text-amber-700/80" : "text-teal/70"
                          }`}
                        >
                          {formatCountdown(e.start, nowMs).label}
                        </div>
                      ) : null}
                      {resolveMeetingLink(e) ? (
                        <div>
                          <JoinMeetingLink link={resolveMeetingLink(e)!} />
                        </div>
                      ) : null}
                      {e.invitees?.length ? (
                        <p className="mt-1 text-xs text-muted">
                          Invitees: {e.invitees.map((i) => i.email).join(", ")}
                          {e.invitesSentAt
                            ? ` · sent ${format(parseISO(e.invitesSentAt), "MMM d h:mm a")}`
                            : ""}
                        </p>
                      ) : null}
                      {e.notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                          <LinkifiedText text={e.notes} />
                        </p>
                      ) : null}
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
                          onClick={() => void emailEventInvites(e)}
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

          {!eventFormOpen && !editingId ? (
            <button
              type="button"
              onClick={() => startNewEvent()}
              className="flex w-full items-center justify-between rounded-xl border border-teal/25 bg-[linear-gradient(145deg,#ecfdf8_0%,#f0f9ff_55%,#fff7ed_100%)] px-3 py-3 text-left transition hover:border-teal/40"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">New event</span>
                <span className="text-xs text-muted">Click to expand and create</span>
              </span>
              <span className="text-sm text-teal" aria-hidden>
                ▾
              </span>
            </button>
          ) : (
          <form
            className="space-y-2 rounded-xl border border-teal/25 bg-[linear-gradient(145deg,#ecfdf8_0%,#f0f9ff_55%,#fff7ed_100%)] p-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              void saveEvent();
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">
                {editingId ? "Update event" : "New event"}
              </h4>
              {!editingId ? (
                <button
                  type="button"
                  className="text-xs font-medium text-muted hover:text-ink"
                  onClick={() => setEventFormOpen(false)}
                >
                  Collapse
                </button>
              ) : null}
            </div>
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
                  <div>
                    {eventZoneHint(startTime)}
                    <label className="block text-xs font-medium text-muted">
                      Start time
                      <Input
                        className="mt-1"
                        type="time"
                        step={300}
                        value={startTime}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!next) return;
                          setEndTime(
                            endAfterStartChange(startTime, endTime, next, eventDurationMinutes),
                          );
                          setStartTime(next);
                        }}
                        required
                      />
                      <TimePeriodToggle
                        value={startTime}
                        onChange={(next) => {
                          setEndTime(
                            endAfterStartChange(startTime, endTime, next, eventDurationMinutes),
                          );
                          setStartTime(next);
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    {eventZoneHint(endTime)}
                    <label className="block text-xs font-medium text-muted">
                      End time
                      <Input
                        className="mt-1"
                        type="time"
                        step={300}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                      <TimePeriodToggle value={endTime} onChange={setEndTime} />
                    </label>
                  </div>
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
            <label className="flex items-start gap-2 rounded-lg border border-teal/20 bg-[#f3fbf8] px-3 py-2 text-sm">
              <input
                className="mt-0.5"
                type="checkbox"
                checked={notifyRecipients}
                onChange={(e) => setNotifyRecipients(e.target.checked)}
              />
              <span>
                <span className="block font-medium text-ink">Email notification when I save</span>
                <span className="block text-xs text-muted">
                  Checked by default. Uncheck to save without emailing recipients.
                </span>
              </span>
            </label>
            {/* Desktop: Teams is always available when the app can open it. Never auto-fill join URLs. */}
            {isDesktop() ? (
              <div className="space-y-2 rounded-lg border border-line/80 bg-white/60 p-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useTeams}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseTeams(on);
                      // Always clear — never keep an autofilled Meet/example URL around
                      setTeamsUrl("");
                    }}
                  />
                  Create Microsoft Teams meeting (your account)
                </label>
                {teamsInstalled === false ? (
                  <p className="text-xs text-amber-800">
                    Teams wasn&apos;t found in the usual install folders. You can still try{" "}
                    <strong>Open Teams</strong> — if Teams is signed in on this Mac/PC it should open.
                  </p>
                ) : null}
                {useTeams ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="soft"
                        disabled={openingTeams}
                        onClick={() => void openTeamsForDraft()}
                      >
                        {openingTeams ? "Opening Teams…" : "Open Teams to create meeting"}
                      </Button>
                      <span className="text-xs text-muted">
                        Uses the Teams account signed in on this Mac/PC.
                      </span>
                    </div>
                    <Input
                      name="em-teams-join-url"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      placeholder="Paste your Teams Join link here (stays empty until you paste)"
                      value={teamsUrl}
                      onChange={(e) => setTeamsUrl(e.target.value)}
                      onFocus={() => {
                        // Strip browser autofill junk (e.g. Meet example links) immediately
                        if (isFakeMeetingUrl(teamsUrl) || /meet\.google/i.test(teamsUrl)) {
                          setTeamsUrl("");
                        }
                      }}
                      onBlur={() => {
                        const v = teamsUrl.trim();
                        if (!v) return;
                        if (isFakeMeetingUrl(v) || /meet\.google/i.test(v) || /zoom\.us/i.test(v)) {
                          setTeamsUrl("");
                          setToast("Teams meetings need a real Teams Join link — not Meet or Zoom.");
                          return;
                        }
                        if (!/teams\.microsoft|teams\.live/i.test(v)) {
                          setTeamsUrl("");
                          setToast("Paste a real Teams Join link from your meeting.");
                        }
                      }}
                    />
                    <p className="text-[11px] text-muted">
                      We never auto-fill a meeting URL. Open Teams → create → copy Join → paste here.
                    </p>
                  </>
                ) : null}
                {!useTeams && editingId && teamsUrl ? (
                  <label className="block text-xs font-medium text-muted">
                    Saved join link
                    <Input
                      className="mt-1"
                      name="em-saved-join-url"
                      type="text"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      value={teamsUrl}
                      onChange={(e) => setTeamsUrl(e.target.value)}
                      onBlur={() => {
                        if (isFakeMeetingUrl(teamsUrl)) {
                          setTeamsUrl("");
                          setToast("Removed example link.");
                        }
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            {isDesktop() && accountId ? (
              <p className="text-xs text-muted">
                Checked notifications send from your connected email account when the event is saved.
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                Connect an IMAP/SMTP account in Settings to email calendar invites.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savingEvent}>
                {savingEvent
                  ? notifyRecipients && parseInvitees(inviteesText).length
                    ? "Saving & emailing…"
                    : "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add event"}
              </Button>
              {editingId ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setEventFormOpen(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
          )}
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

      {daySheetDate ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
          role="presentation"
          onClick={closeDaySheet}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-sheet-title"
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 id="day-sheet-title" className="font-display text-xl tracking-tight text-ink">
                  {format(parseISO(daySheetDate), "EEEE, MMMM d")}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {daySheetEvents.length} event
                  {daySheetEvents.length === 1 ? "" : "s"} · add or edit below
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={closeDaySheet}>
                Close
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {!daySheetCompose ? (
                <>
                  <ul className="space-y-2">
                    {daySheetEvents.map((e) => (
                      <li key={e.id} className="rounded-xl border border-line p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink">
                              <span
                                className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                                style={{ background: colorFor(e.calendarId) }}
                              />
                              {e.title}
                              {e.source === "mac" ? (
                                <span className="ml-2 text-xs font-normal text-muted">Mac</span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-sm text-muted">
                              {e.allDay
                                ? "All day"
                                : `${format(parseISO(e.start), "h:mm a")} – ${format(parseISO(e.end), "h:mm a")}`}
                              {e.location ? ` · ${e.location}` : ""}
                            </div>
                            {e.countdown && +new Date(e.start) >= nowMs ? (
                              <div
                                className={`mt-0.5 font-mono text-xs tracking-tight ${
                                  formatCountdown(e.start, nowMs).urgent
                                    ? "text-amber-700/80"
                                    : "text-teal/70"
                                }`}
                              >
                                {formatCountdown(e.start, nowMs).label}
                              </div>
                            ) : null}
                            {resolveMeetingLink(e) ? (
                              <div>
                                <JoinMeetingLink link={resolveMeetingLink(e)!} compact />
                              </div>
                            ) : null}
                            {e.invitees?.length ? (
                              <p className="mt-1 text-xs text-muted">
                                Recipients: {e.invitees.map((invitee) => invitee.email).join(", ")}
                                {e.invitesSentAt
                                  ? ` · emailed ${format(parseISO(e.invitesSentAt), "MMM d h:mm a")}`
                                  : " · not emailed"}
                              </p>
                            ) : null}
                            {e.notes ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                                <LinkifiedText text={e.notes} />
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => {
                                beginEdit(e);
                                setEventFormOpen(false);
                                setDaySheetCompose(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => updateEvent(e.id, { countdown: !e.countdown })}
                            >
                              {e.countdown ? "Countdown ✓" : "Countdown"}
                            </Button>
                            {isDesktop() && accountId && (e.invitees?.length || 0) > 0 ? (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={sendingInviteId === e.id}
                                onClick={() => void emailEventInvites(e)}
                              >
                                {sendingInviteId === e.id ? "Emailing…" : "Email recipients"}
                              </Button>
                            ) : null}
                            {e.source !== "mac" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  deleteEvent(e.id);
                                  setToast("Event deleted");
                                }}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                    {daySheetEvents.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
                        Nothing scheduled — create an event for this day.
                      </li>
                    ) : null}
                  </ul>
                  <div className="mt-4">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => openDaySheet(daySheetDate, { compose: true })}
                    >
                      New event
                    </Button>
                  </div>
                </>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void saveEvent();
                  }}
                >
                  <h3 className="text-sm font-semibold text-ink">
                    {editingId ? "Edit event" : "New event"}
                  </h3>
                  <Input
                    placeholder="Event title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    autoFocus
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                    All-day event
                  </label>
                  {!allDay ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-medium text-muted">
                        Start
                        <Input
                          className="mt-1"
                          type="time"
                          step={300}
                          value={startTime}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!next) return;
                            setEndTime(
                              endAfterStartChange(startTime, endTime, next, eventDurationMinutes),
                            );
                            setStartTime(next);
                          }}
                          required
                        />
                        <TimePeriodToggle
                          value={startTime}
                          onChange={(next) => {
                            setEndTime(
                              endAfterStartChange(startTime, endTime, next, eventDurationMinutes),
                            );
                            setStartTime(next);
                          }}
                        />
                      </label>
                      <label className="block text-xs font-medium text-muted">
                        End
                        <Input
                          className="mt-1"
                          type="time"
                          step={300}
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          required
                        />
                        <TimePeriodToggle value={endTime} onChange={setEndTime} />
                      </label>
                    </div>
                  ) : null}
                  <Input
                    placeholder="Location (optional)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Recipient emails (comma or newline separated)"
                    value={inviteesText}
                    onChange={(e) => setInviteesText(e.target.value)}
                  />
                  <label className="flex items-start gap-2 rounded-lg border border-teal/20 bg-[#f3fbf8] px-3 py-2 text-sm">
                    <input
                      className="mt-0.5"
                      type="checkbox"
                      checked={notifyRecipients}
                      onChange={(e) => setNotifyRecipients(e.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-ink">Email notification when I save</span>
                      <span className="block text-xs text-muted">
                        Checked by default. Uncheck to add the event without emailing recipients.
                      </span>
                    </span>
                  </label>
                  {isDesktop() ? (
                    <div className="space-y-2 rounded-lg border border-line bg-soft/30 p-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-ink">
                        <input
                          type="checkbox"
                          checked={useTeams}
                          onChange={(e) => {
                            setUseTeams(e.target.checked);
                            setTeamsUrl("");
                          }}
                        />
                        Microsoft Teams meeting
                      </label>
                      {teamsInstalled === false ? (
                        <p className="text-xs text-amber-800">
                          Teams wasn&apos;t found automatically. You can still try Open Teams if it is
                          installed and signed in.
                        </p>
                      ) : null}
                      {useTeams ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="soft"
                            disabled={openingTeams}
                            onClick={() => void openTeamsForDraft()}
                          >
                            {openingTeams ? "Opening Teams…" : "Open Teams for this date & time"}
                          </Button>
                          <Input
                            name="em-day-sheet-teams-join-url"
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder="Paste the real Teams Join link"
                            value={teamsUrl}
                            onChange={(e) => setTeamsUrl(e.target.value)}
                            onFocus={() => {
                              if (isFakeMeetingUrl(teamsUrl) || /meet\.google/i.test(teamsUrl)) {
                                setTeamsUrl("");
                              }
                            }}
                            onBlur={() => {
                              const value = teamsUrl.trim();
                              if (!value) return;
                              if (
                                isFakeMeetingUrl(value) ||
                                !/teams\.microsoft|teams\.live/i.test(value)
                              ) {
                                setTeamsUrl("");
                                setToast("Paste a real Teams Join link from your meeting.");
                              }
                            }}
                          />
                          <p className="text-[11px] text-muted">
                            Teams opens with this event&apos;s title, date, and time. Create it there,
                            then copy its Join link back here.
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="submit" disabled={savingEvent}>
                      {savingEvent
                        ? notifyRecipients && parseInvitees(inviteesText).length
                          ? "Saving & emailing…"
                          : "Saving…"
                        : editingId
                          ? "Save changes"
                          : "Add event"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        resetForm();
                        setDaySheetCompose(false);
                        setEventDate(daySheetDate);
                      }}
                    >
                      Back to list
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
