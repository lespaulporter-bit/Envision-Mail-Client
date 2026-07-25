"use client";

import { Button, Input, Textarea } from "@/components/ui";
import { useHeyStore } from "@/lib/store";
import type { EmailTemplate } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useState } from "react";

export function EmailTemplatesPanel() {
  const templates = useHeyStore((s) => s.emailTemplates || []);
  const upsertEmailTemplate = useHeyStore((s) => s.upsertEmailTemplate);
  const deleteEmailTemplate = useHeyStore((s) => s.deleteEmailTemplate);
  const [draft, setDraft] = useState<EmailTemplate>({
    id: "",
    name: "",
    subject: "",
    body: "",
  });

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white/90 p-4">
      <div>
        <h3 className="font-display text-xl">Email templates</h3>
        <p className="text-sm text-muted">
          Unlimited templates. Pick them from dropdowns when composing or replying.
        </p>
      </div>
      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.name}</div>
              {t.subject ? <div className="text-xs text-muted">Subject: {t.subject}</div> : null}
              <div className="mt-1 line-clamp-2 text-xs text-muted whitespace-pre-wrap">{t.body}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(t)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => deleteEmailTemplate(t.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
      <form
        className="space-y-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim() || !draft.body.trim()) return;
          upsertEmailTemplate({
            ...draft,
            id: draft.id || uid("et"),
            name: draft.name.trim(),
            subject: draft.subject?.trim() || undefined,
            body: draft.body,
          });
          setDraft({ id: "", name: "", subject: "", body: "" });
        }}
      >
        <Input
          placeholder="Template name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          required
        />
        <Input
          placeholder="Optional subject"
          value={draft.subject || ""}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
        />
        <Textarea
          rows={5}
          placeholder="Email body…"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          required
        />
        <div className="flex gap-2">
          <Button type="submit">{draft.id ? "Save template" : "Add template"}</Button>
          {draft.id ? (
            <Button type="button" variant="ghost" onClick={() => setDraft({ id: "", name: "", subject: "", body: "" })}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
