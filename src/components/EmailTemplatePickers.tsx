"use client";

import { useState } from "react";
import { useMailStore } from "@/lib/store";
import { stripHtml } from "@/lib/utils";

type Props = {
  onInsertBody: (text: string, mode?: "replace" | "append") => void;
  onInsertSubject?: (subject: string) => void;
  /** Select which HTML signature is attached on Send — never dump markup into the plain-text box. */
  onSelectSignature?: (signatureId: string) => void;
  showSubjectTemplates?: boolean;
  className?: string;
};

/** Dropdowns for email templates, snippets, and signatures — compose & reply. */
export function EmailTemplatePickers({
  onInsertBody,
  onInsertSubject,
  onSelectSignature,
  showSubjectTemplates = true,
  className = "",
}: Props) {
  const templates = useMailStore((s) => s.emailTemplates || []);
  const snippets = useMailStore((s) => s.snippets || []);
  const signatures = useMailStore((s) => s.signatures || []);
  const setToast = useMailStore((s) => s.setToast);
  const [templateId, setTemplateId] = useState("");
  const [snippetId, setSnippetId] = useState("");
  const [sigPickId, setSigPickId] = useState("");

  return (
    <div className={`relative z-10 grid gap-2 sm:grid-cols-3 ${className}`}>
      <label className="block text-xs font-medium text-muted">
        Email template
        <select
          className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          value={templateId}
          onChange={(e) => {
            const id = e.target.value;
            setTemplateId("");
            if (!id) return;
            const t = templates.find((x) => x.id === id);
            if (!t) return;
            // Templates may be HTML — keep plain text in the composer box only.
            const body = /<[a-z][\s\S]*>/i.test(t.body) ? stripHtml(t.body) : t.body;
            onInsertBody(body, "replace");
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
          className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          value={snippetId}
          onChange={(e) => {
            const id = e.target.value;
            setSnippetId("");
            if (!id) return;
            const s = snippets.find((x) => x.id === id);
            if (!s) return;
            const body = /<[a-z][\s\S]*>/i.test(s.body) ? stripHtml(s.body) : s.body;
            onInsertBody(body, "append");
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
        Signature (on send)
        <select
          className="mt-1 w-full cursor-pointer rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
          value={sigPickId}
          onChange={(e) => {
            const id = e.target.value;
            setSigPickId("");
            if (!id) return;
            const sig = signatures.find((x) => x.id === id);
            if (!sig) return;
            if (onSelectSignature) {
              onSelectSignature(id);
              setToast(`Signature “${sig.name}” will be added when you send`);
              return;
            }
            // Fallback: never dump raw HTML into a plain-text composer.
            onInsertBody(stripHtml(sig.html), "append");
            setToast("Signature text appended (HTML is attached only on send)");
          }}
        >
          <option value="">Choose signature…</option>
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
