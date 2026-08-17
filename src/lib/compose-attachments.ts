/** Limits match typical SMTP / Gmail caps so send does not silently fail. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_FILES = 20;

export type DraftAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** Web-only fallback when the desktop picker is unavailable. */
  contentBase64?: string;
};

export function isOutgoingAttachmentId(id?: string | null): boolean {
  return /^out_[a-z0-9]+$/i.test(String(id || "").trim());
}

export function attachmentBytesTotal(files: Array<{ size?: number }>): number {
  return files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
}

export function canAddAttachments(
  current: Array<{ size?: number }>,
  incoming: Array<{ size?: number; name?: string }>,
): { ok: true } | { ok: false; error: string } {
  if (!incoming.length) return { ok: true };
  if (current.length + incoming.length > MAX_ATTACHMENT_FILES) {
    return { ok: false, error: `You can attach up to ${MAX_ATTACHMENT_FILES} files` };
  }
  for (const file of incoming) {
    const size = Number(file.size) || 0;
    if (size <= 0) return { ok: false, error: `${file.name || "That file"} is empty` };
    if (size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `${file.name || "That file"} is over 25 MB` };
    }
  }
  const total = attachmentBytesTotal(current) + attachmentBytesTotal(incoming);
  if (total > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "Attachments together must stay under 25 MB" };
  }
  return { ok: true };
}

export function toSendAttachments(files: DraftAttachment[]) {
  return files.map((file) =>
    file.contentBase64
      ? {
          id: file.id,
          filename: file.name,
          contentBase64: file.contentBase64,
          contentType: file.mimeType,
        }
      : {
          id: file.id,
          filename: file.name,
          contentType: file.mimeType,
        },
  );
}
