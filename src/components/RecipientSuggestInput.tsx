"use client";

import { Input } from "@/components/ui";
import { filterContactsByAccount, filterThreadsByAccount } from "@/lib/account-scope";
import { useMailStore } from "@/lib/store";
import { asArray } from "@/lib/stable-empty";
import type { Message } from "@/lib/types";
import {
  applyRecipientSuggestion,
  buildRecipientSuggestions,
  currentRecipientQuery,
  mergePastedRecipients,
  normalizeRecipientField,
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
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Optional short label shown above the field (To / Cc / Bcc). */
  label?: string;
}) {
  const contacts = useMailStore((s) => s.contacts);
  const threads = useMailStore((s) => s.threads);
  const messages = useMailStore((s) => s.messages);
  const recentRecipients = useMailStore((s) => asArray(s.recentRecipients));
  const inboxAccountId = useMailStore((s) => s.inboxAccountId);
  const settings = useMailStore((s) => s.settings);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const { query } = useMemo(() => currentRecipientQuery(value), [value]);
  const already = useMemo(() => parseRecipientEmails(value), [value]);

  // Strict account isolation: only suggest people the ACTIVE account has
  // actually corresponded with, plus its own address book. The store's
  // contacts / recentRecipients lists are global, so without this the "To"
  // autocomplete leaked recipients from other accounts that had never sent to
  // or received from that address.
  const scoped = useMemo(() => {
    if (!inboxAccountId) {
      return {
        scopedThreads: [] as typeof threads,
        scopedContacts: [] as typeof contacts,
        scopedMessages: {} as Record<string, Message | undefined>,
        scopedRecents: [] as typeof recentRecipients,
        ownSet: new Set<string>(),
      };
    }
    const scopedThreads = filterThreadsByAccount(threads, inboxAccountId, messages);
    const scopedContacts = filterContactsByAccount(contacts, threads, inboxAccountId, messages);
    const scopedMessages: Record<string, Message | undefined> = {};
    const addressSet = new Set<string>();
    const ownSet = new Set<string>();
    for (const t of scopedThreads) {
      if (t.contactEmail) addressSet.add(t.contactEmail.toLowerCase());
      if (t.accountEmail) ownSet.add(t.accountEmail.toLowerCase());
      for (const mid of t.messageIds || []) {
        const m = messages[mid];
        if (!m) continue;
        scopedMessages[mid] = m;
        if (m.from) addressSet.add(m.from.toLowerCase());
        for (const to of m.to || []) addressSet.add(to.toLowerCase());
        for (const cc of m.cc || []) addressSet.add(cc.toLowerCase());
        for (const bcc of m.bcc || []) addressSet.add(bcc.toLowerCase());
      }
    }
    const scopedRecents = inboxAccountId
      ? recentRecipients.filter((r) => addressSet.has(String(r.email || "").toLowerCase()))
      : recentRecipients;
    return { scopedThreads, scopedContacts, scopedMessages, scopedRecents, ownSet };
  }, [threads, contacts, messages, recentRecipients, inboxAccountId]);

  const ownEmails = useMemo(
    () => [settings.email, settings.workEmail, ...scoped.ownSet].filter(Boolean) as string[],
    [settings.email, settings.workEmail, scoped.ownSet],
  );

  const suggestions = useMemo(
    () =>
      buildRecipientSuggestions({
        query,
        contacts: scoped.scopedContacts,
        threads: scoped.scopedThreads,
        messages: scoped.scopedMessages,
        recent: scoped.scopedRecents,
        exclude: already,
        ownEmails,
        limit: 8,
      }),
    [query, scoped, already, ownEmails],
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
    // Keep focus so the next address can be typed immediately
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const show = open && suggestions.length > 0;
  const count = already.length;

  return (
    <div ref={wrapRef} className={cn("relative min-w-0 flex-1", className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
          {count > 0 ? (
            <span className="text-[11px] text-muted">
              {count} address{count === 1 ? "" : "es"}
            </span>
          ) : null}
        </div>
      ) : count > 1 ? (
        <div className="mb-1 text-right text-[11px] text-muted">
          {count} addresses
        </div>
      ) : null}
      <Input
        ref={inputRef}
        className="w-full"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          // Normalize "Name <a@x.com>; b@y.com\nc@z.com" → clean comma list
          const next = normalizeRecipientField(value);
          if (next && next !== value.trim()) onChange(next);
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!pasted) return;
          // Multi-recipient paste (Outlook / Excel / Gmail copy)
          const looksMulti =
            pastedEmailsQuick(pasted) > 1 || /[,;\n\r\t]/.test(pasted);
          if (!looksMulti && pastedEmailsQuick(pasted) < 1) return;
          const el = e.currentTarget;
          const start = el.selectionStart ?? value.length;
          const end = el.selectionEnd ?? value.length;
          const merged = mergePastedRecipients(value, pasted, start, end);
          if (merged === value) return;
          e.preventDefault();
          onChange(merged);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          // Comma / semicolon commits the current token (Outlook-style)
          if ((e.key === "," || e.key === ";") && /@/.test(query)) {
            e.preventDefault();
            const next = normalizeRecipientField(value);
            onChange(next ? `${next}, ` : "");
            setOpen(true);
            return;
          }
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

function pastedEmailsQuick(text: string): number {
  return parseRecipientEmails(text).length;
}
