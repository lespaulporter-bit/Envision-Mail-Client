"use client";

import { Button } from "@/components/ui";
import {
  attachmentIcon,
  attachmentKind,
  base64ToObjectUrl,
  base64ToText,
  canPreviewInApp,
  isServerAttachment,
} from "@/lib/attachments";
import { desktopApi } from "@/lib/desktop";
import { useMailStore } from "@/lib/store";
import type { Attachment } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";
import { useEffect, useRef, useState, type ReactNode } from "react";

const DESKTOP_ONLY = "Open Envision Mail on your desktop to view or save attachments.";
const NOT_SYNCED = "Sync this account to open this file.";

type PreviewTarget = { attachment: Attachment; accountId?: string | null };

function unavailableReason(attachment: Attachment): string | null {
  if (!desktopApi()) return DESKTOP_ONLY;
  if (!isServerAttachment(attachment)) return NOT_SYNCED;
  return null;
}

/**
 * File rows for a message. Double-click opens the file, right-click drops it on
 * the Desktop — the buttons do the same thing for anyone who prefers clicking.
 */
export function AttachmentList({
  attachments,
  accountId,
  accountIdFor,
  className,
  renderMeta,
  renderExtraActions,
}: {
  attachments: Attachment[];
  accountId?: string | null;
  /** Per-file override when a list spans several mailboxes (e.g. the Attachments view). */
  accountIdFor?: (attachment: Attachment) => string | null | undefined;
  className?: string;
  renderMeta?: (attachment: Attachment) => ReactNode;
  renderExtraActions?: (attachment: Attachment) => ReactNode;
}) {
  const setToast = useMailStore((s) => s.setToast);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const ownerAccountId = (attachment: Attachment) => accountIdFor?.(attachment) ?? accountId ?? null;

  const openAttachment = async (attachment: Attachment) => {
    const blocked = unavailableReason(attachment);
    if (blocked) {
      setToast(blocked);
      return;
    }
    if (canPreviewInApp(attachment.mimeType, attachment.name)) {
      setPreview({ attachment, accountId: ownerAccountId(attachment) });
      return;
    }
    setBusyId(attachment.id);
    setToast(`Opening ${attachment.name}…`);
    const res = await desktopApi()!.openAttachment({
      accountId: ownerAccountId(attachment),
      attachmentId: attachment.id,
      name: attachment.name,
    });
    setBusyId(null);
    setToast(res.ok ? `Opened ${attachment.name}` : res.error || "Could not open that attachment.");
  };

  const saveToDesktop = async (attachment: Attachment, saveAs = false) => {
    const blocked = unavailableReason(attachment);
    if (blocked) {
      setToast(blocked);
      return;
    }
    setBusyId(attachment.id);
    setToast(`Saving ${attachment.name}…`);
    const res = await desktopApi()!.saveAttachment({
      accountId: ownerAccountId(attachment),
      attachmentId: attachment.id,
      name: attachment.name,
      saveAs,
    });
    setBusyId(null);
    if (res.cancelled) {
      setToast(null);
      return;
    }
    if (!res.ok) {
      setToast(res.error || "Could not save that attachment.");
      return;
    }
    setToast(saveAs ? `Saved ${res.name}` : `Saved ${res.name} to your Desktop`);
  };

  if (!attachments.length) return null;

  return (
    <>
      <ul className={cn("space-y-2", className)}>
        {attachments.map((a) => (
          <li key={a.id}>
            <div
              role="button"
              tabIndex={0}
              aria-label={`${a.name}, ${formatBytes(a.size)}. Press Enter to open, or right-click to save to Desktop.`}
              title="Double-click to open · right-click to save to your Desktop"
              className={cn(
                "flex select-none flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 text-sm transition hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-teal",
                busyId === a.id && "opacity-60",
              )}
              onDoubleClick={() => void openAttachment(a)}
              onContextMenu={(e) => {
                e.preventDefault();
                void saveToDesktop(a);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openAttachment(a);
                }
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="mr-1.5">{attachmentIcon(a.mimeType, a.name)}</span>
                <span className="break-all font-medium">{a.name}</span>{" "}
                <span className="text-muted">({formatBytes(a.size)})</span>
                {renderMeta ? <span className="block text-[11px] text-muted">{renderMeta(a)}</span> : null}
                <span className="block text-[11px] text-muted">
                  Double-click to open · right-click to save to Desktop
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => void openAttachment(a)} disabled={busyId === a.id}>
                  Open
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void saveToDesktop(a)} disabled={busyId === a.id}>
                  Save
                </Button>
                {renderExtraActions?.(a)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {preview ? (
        <AttachmentPreview
          key={preview.attachment.id}
          attachment={preview.attachment}
          accountId={preview.accountId}
          onClose={() => setPreview(null)}
          onSave={(saveAs) => void saveToDesktop(preview.attachment, saveAs)}
        />
      ) : null}
    </>
  );
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; text: string | null; mimeType: string };

function AttachmentPreview({
  attachment,
  accountId,
  onClose,
  onSave,
}: {
  attachment: Attachment;
  accountId?: string | null;
  onClose: () => void;
  onSave: (saveAs: boolean) => void;
}) {
  const setToast = useMailStore((s) => s.setToast);
  const [state, setState] = useState<PreviewState>(() =>
    desktopApi() ? { status: "loading" } : { status: "error", message: DESKTOP_ONLY },
  );
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const api = desktopApi();
    if (!api) return;
    void api
      .getAttachment({ accountId, attachmentId: attachment.id, name: attachment.name })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.base64) {
          setState({ status: "error", message: res.error || "Could not load that attachment." });
          return;
        }
        const mimeType = res.mimeType || attachment.mimeType;
        const kind = attachmentKind(mimeType, attachment.name);
        const url = base64ToObjectUrl(res.base64, mimeType);
        urlRef.current = url;
        setState({
          status: "ready",
          url,
          text: kind === "text" ? base64ToText(res.base64) : null,
          mimeType,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [accountId, attachment.id, attachment.mimeType, attachment.name]);

  const openWithSystemApp = async () => {
    const api = desktopApi();
    if (!api) {
      setToast(DESKTOP_ONLY);
      return;
    }
    const res = await api.openAttachment({
      accountId,
      attachmentId: attachment.id,
      name: attachment.name,
    });
    setToast(res.ok ? `Opened ${attachment.name}` : res.error || "Could not open that attachment.");
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 p-3 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${attachment.name}`}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg tracking-tight text-ink">
              {attachmentIcon(attachment.mimeType, attachment.name)} {attachment.name}
            </h2>
            <p className="text-xs text-muted">
              {formatBytes(attachment.size)} · {attachment.mimeType || "file"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => void openWithSystemApp()}>
              Open with default app
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSave(true)}>
              Save as…
            </Button>
            <Button size="sm" variant="soft" onClick={() => onSave(false)}>
              Save to Desktop
            </Button>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-[240px] flex-1 overflow-auto bg-soft p-3">
          {state.status === "loading" ? (
            <p className="p-6 text-center text-sm text-muted">Loading {attachment.name}…</p>
          ) : null}
          {state.status === "error" ? (
            <div className="p-6 text-center">
              <p className="text-sm text-ink">{state.message}</p>
              <Button className="mt-3" size="sm" variant="soft" onClick={() => void openWithSystemApp()}>
                Try opening with the default app
              </Button>
            </div>
          ) : null}
          {state.status === "ready" ? <PreviewBody attachment={attachment} state={state} /> : null}
        </div>
      </div>
    </div>
  );
}

function PreviewBody({
  attachment,
  state,
}: {
  attachment: Attachment;
  state: Extract<PreviewState, { status: "ready" }>;
}) {
  const kind = attachmentKind(state.mimeType, attachment.name);
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={state.url}
        alt={attachment.name}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg bg-white object-contain shadow-sm"
      />
    );
  }
  if (kind === "pdf") {
    return (
      <iframe
        src={state.url}
        title={attachment.name}
        className="h-[70vh] w-full rounded-lg border border-line bg-white"
      />
    );
  }
  return (
    <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-xs leading-relaxed text-ink">
      {state.text}
    </pre>
  );
}
