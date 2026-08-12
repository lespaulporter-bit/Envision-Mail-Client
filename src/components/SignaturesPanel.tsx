"use client";

import { HtmlField } from "@/components/HtmlField";
import { Button, Input } from "@/components/ui";
import { useMailStore } from "@/lib/store";
import { asArray } from "@/lib/stable-empty";
import { uid } from "@/lib/utils";
import type { SignatureTemplate } from "@/lib/types";
import { useState } from "react";

export function SignaturesPanel() {
  const signatures = useMailStore((s) => asArray(s.signatures));
  const upsertSignature = useMailStore((s) => s.upsertSignature);
  const deleteSignature = useMailStore((s) => s.deleteSignature);
  const setDefaultSignature = useMailStore((s) => s.setDefaultSignature);
  const [draft, setDraft] = useState<SignatureTemplate>({
    id: "",
    name: "",
    html: "",
    imageDataUrl: undefined,
    isDefault: false,
  });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-xl">Signature templates</h3>
        <p className="text-sm text-muted">
          Paste your existing HTML signature (Outlook, Gmail, Word). Unlimited templates + optional image.
        </p>
      </div>
      <div className="space-y-2">
        {signatures.map((s) => (
          <div key={s.id} className="rounded-xl border border-line bg-soft/40 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">
                {s.name} {s.isDefault ? "· default" : ""}
              </strong>
              <div className="flex gap-1">
                <Button size="sm" variant="soft" onClick={() => setDefaultSignature(s.id)}>
                  Default
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(s)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteSignature(s.id)}>
                  Delete
                </Button>
              </div>
            </div>
            <div className="prose-mail text-sm" dangerouslySetInnerHTML={{ __html: s.html }} />
            {s.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.imageDataUrl} alt="" className="mt-2 max-h-16 rounded" />
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="space-y-2 rounded-xl border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim() || !draft.html.trim()) return;
          upsertSignature({
            ...draft,
            id: draft.id || uid("sig"),
            name: draft.name.trim(),
            html: draft.html.trim(),
          });
          setDraft({ id: "", name: "", html: "", imageDataUrl: undefined, isDefault: false });
        }}
      >
        <Input
          placeholder="Signature name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <HtmlField
          value={draft.html}
          onChange={(html) => setDraft({ ...draft, html })}
          placeholder="Paste your current signature here…"
          minHeight={160}
        />
        <label className="block text-sm">
          Optional image
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setDraft({ ...draft, imageDataUrl: String(reader.result || "") });
              reader.readAsDataURL(file);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(draft.isDefault)}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
          />
          Make default
        </label>
        <Button type="submit">{draft.id ? "Save signature" : "Add signature"}</Button>
      </form>
    </div>
  );
}
