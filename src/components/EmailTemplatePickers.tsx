"use client";

import { useHeyStore } from "@/lib/store";

type Props = {
  onInsertBody: (text: string, mode?: "replace" | "append") => void;
  onInsertSubject?: (subject: string) => void;
  showSubjectTemplates?: boolean;
  className?: string;
};

/** Dropdowns for email templates, snippets, and signatures — compose & reply. */
export function EmailTemplatePickers({
  onInsertBody,
  onInsertSubject,
  showSubjectTemplates = true,
  className = "",
}: Props) {
  const templates = useHeyStore((s) => s.emailTemplates || []);
  const snippets = useHeyStore((s) => s.snippets || []);
  const signatures = useHeyStore((s) => s.signatures || []);

  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${className}`}>
      <label className="block text-xs font-medium text-muted">
        Email template
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            e.target.value = "";
            if (!id) return;
            const t = templates.find((x) => x.id === id);
            if (!t) return;
            onInsertBody(t.body, "replace");
            if (showSubjectTemplates && t.subject && onInsertSubject) onInsertSubject(t.subject);
          }}
        >
          <option value="">Insert template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-muted">
        Snippet
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            e.target.value = "";
            if (!id) return;
            const s = snippets.find((x) => x.id === id);
            if (!s) return;
            onInsertBody(s.body, "append");
          }}
        >
          <option value="">Insert snippet…</option>
          {snippets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-muted">
        Signature (append)
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            e.target.value = "";
            if (!id) return;
            const sig = signatures.find((x) => x.id === id);
            if (!sig) return;
            const plain = sig.html
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n")
              .replace(/<[^>]+>/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            onInsertBody(plain, "append");
          }}
        >
          <option value="">Insert signature text…</option>
          {signatures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
