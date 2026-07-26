"use client";

import { Input } from "@/components/ui";
import { useMailStore } from "@/lib/store";
import {
  applyRecipientSuggestion,
  buildRecipientSuggestions,
  currentRecipientQuery,
  parseRecipientEmails,
  type RecipientSuggestion,
} from "@/lib/recipient-suggest";
import { cn } from "@/lib/utils";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const SOURCE_LABEL: Record<RecipientSuggestion["source"], string> = {
  contact: "Address book",
  recent: "Recent",
  mail: "Mail",
};

export function RecipientSuggestInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const contacts = useMailStore((s) => s.contacts);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const recentRecipients = useMailStore((s) => s.recentRecipients || []);
  const settings = useMailStore((s) => s.settings);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const { query } = useMemo(() => currentRecipientQuery(value), [value]);
  const already = useMemo(() => parseRecipientEmails(value), [value]);
  const ownEmails = useMemo(
    () => [settings.email, settings.workEmail].filter(Boolean) as string[],
    [settings.email, settings.workEmail],
  );

  const suggestions = useMemo(
    () =>
      buildRecipientSuggestions({
        query,
        contacts,
        threads,
        messages,
        recent: recentRecipients,
        exclude: already,
        ownEmails,
        limit: 8,
      }),
    [query, contacts, threads, messages, recentRecipients, already, ownEmails],
  );

  useEffect(() => {
    setActive(0);
  }, [query, suggestions.length]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: RecipientSuggestion) => {
    onChange(applyRecipientSuggestion(value, s.email));
    setOpen(false);
  };

  const show = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className={cn("relative min-w-0 flex-1", className)}>
      <Input
        className="w-full"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" || e.key === "Tab") {
            if (suggestions[active]) {
              e.preventDefault();
              pick(suggestions[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {show ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.email} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition",
                  i === active ? "bg-soft" : "hover:bg-soft/80",
                )}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal/15 text-xs font-semibold text-teal"
                  aria-hidden
                >
                  {(s.name || s.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.name || s.email}</span>
                  <span className="block truncate text-xs text-muted">{s.email}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {SOURCE_LABEL[s.source]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
