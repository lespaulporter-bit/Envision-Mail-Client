"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";

/** Allow common signature/email markup; strip scripts and handlers. */
export function sanitizeSignatureHtml(input: string): string {
  let html = String(input || "");
  html = html.replace(/<\/?script\b[^>]*>/gi, "");
  html = html.replace(/<\/?iframe\b[^>]*>/gi, "");
  html = html.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  html = html.replace(/javascript\s*:/gi, "");
  // Drop Word conditional comments noise
  html = html.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  return html.trim();
}

function looksLikeHtml(s: string) {
  return /<[a-z][\s\S]*>/i.test(s);
}

function plainToHtml(plain: string) {
  return plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
};

export function HtmlField({ value, onChange, placeholder, className, minHeight = 140 }: Props) {
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const editorRef = useRef<HTMLDivElement>(null);
  const skipping = useRef(false);

  useEffect(() => {
    if (mode !== "visual") return;
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== (value || "")) {
      skipping.current = true;
      el.innerHTML = value || "";
      skipping.current = false;
    }
  }, [value, mode]);

  const commitFromEditor = () => {
    const el = editorRef.current;
    if (!el || skipping.current) return;
    onChange(sanitizeSignatureHtml(el.innerHTML));
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clip = e.clipboardData;
    const html = clip.getData("text/html");
    const plain = clip.getData("text/plain");
    const rtf = clip.getData("text/rtf");
    let next = "";
    if (html && looksLikeHtml(html)) {
      next = sanitizeSignatureHtml(html);
    } else if (plain) {
      // Keep line breaks; if user pasted raw HTML source, honor it
      next = looksLikeHtml(plain) ? sanitizeSignatureHtml(plain) : plainToHtml(plain);
    } else if (rtf) {
      next = plainToHtml(plain || "");
    }
    if (!next) return;
    document.execCommand("insertHTML", false, next);
    commitFromEditor();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Paste from Outlook, Gmail, or Word — formatting & links are kept as HTML.
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium",
              mode === "visual" ? "bg-[#0d9488] text-white" : "bg-soft text-ink",
            )}
            onClick={() => setMode("visual")}
          >
            Visual
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium",
              mode === "source" ? "bg-[#0d9488] text-white" : "bg-soft text-ink",
            )}
            onClick={() => setMode("source")}
          >
            HTML
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <div
          ref={editorRef}
          className="prose-mail w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-[#0d9488]"
          style={{ minHeight }}
          contentEditable
          role="textbox"
          aria-multiline
          data-placeholder={placeholder || "Paste your signature here…"}
          suppressContentEditableWarning
          onInput={commitFromEditor}
          onBlur={commitFromEditor}
          onPaste={onPaste}
        />
      ) : (
        <textarea
          className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#0d9488]"
          style={{ minHeight }}
          value={value}
          placeholder="<div>Your HTML signature…</div>"
          onChange={(e) => onChange(sanitizeSignatureHtml(e.target.value))}
        />
      )}

      {value ? (
        <div className="rounded-lg border border-dashed border-line bg-soft/50 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Preview</div>
          <div className="prose-mail text-sm" dangerouslySetInnerHTML={{ __html: value }} />
        </div>
      ) : null}
    </div>
  );
}
