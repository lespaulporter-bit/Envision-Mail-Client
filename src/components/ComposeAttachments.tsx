"use client";

import { Button } from "@/components/ui";
import { canAddAttachments, type DraftAttachment } from "@/lib/compose-attachments";
import { desktopApi } from "@/lib/desktop";
import { attachmentIcon } from "@/lib/attachments";
import { formatBytes, uid } from "@/lib/utils";
import { useRef } from "react";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function ComposeAttachments({
  files,
  onChange,
  disabled,
  onError,
}: {
  files: DraftAttachment[];
  onChange: (files: DraftAttachment[]) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: DraftAttachment[]) => {
    const check = canAddAttachments(files, incoming);
    if (!check.ok) {
      onError?.(check.error);
      return;
    }
    onChange([...files, ...incoming]);
  };

  const pick = async () => {
    const api = desktopApi();
    if (api?.pickAttachments) {
      const result = await api.pickAttachments();
      if (!result.ok) {
        onError?.(result.error || "Could not attach that file");
        return;
      }
      if (result.cancelled) return;
      addFiles(result.files || []);
      return;
    }
    inputRef.current?.click();
  };

  const onInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length) return;
    try {
      const incoming: DraftAttachment[] = [];
      for (const file of picked) {
        const contentBase64 = await fileToBase64(file);
        const api = desktopApi();
        if (api?.stageAttachment) {
          const staged = await api.stageAttachment({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            contentBase64,
          });
          if (!staged.ok || !staged.file) {
            onError?.(staged.error || `Could not attach ${file.name}`);
            return;
          }
          incoming.push(staged.file);
        } else {
          incoming.push({
            id: uid("out"),
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            contentBase64,
          });
        }
      }
      addFiles(incoming);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not attach that file");
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void onInput(event)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="soft" disabled={disabled} onClick={() => void pick()}>
          📎 Attach files
        </Button>
        {files.length ? (
          <span className="text-xs text-muted">
            {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(files.reduce((n, f) => n + f.size, 0))}
          </span>
        ) : (
          <span className="text-xs text-muted">PDF, photos, Office docs — up to 25 MB</span>
        )}
      </div>
      {files.length ? (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-soft/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="mr-1.5">{attachmentIcon(file.mimeType, file.name)}</span>
                {file.name}
                <span className="ml-2 text-xs text-muted">{formatBytes(file.size)}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(files.filter((f) => f.id !== file.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
