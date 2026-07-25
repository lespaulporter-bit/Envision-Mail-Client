"use client";

import { cn, initials } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "salmon" | "soft";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition active:scale-[0.98] disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-5 py-2.5 text-base",
        variant === "primary" && "bg-teal text-white shadow-sm hover:brightness-110",
        variant === "secondary" && "bg-ink text-white hover:opacity-90",
        variant === "ghost" && "bg-transparent text-ink hover:bg-soft",
        variant === "danger" && "bg-salmon text-white hover:brightness-105",
        variant === "salmon" && "bg-salmon text-white hover:brightness-105",
        variant === "soft" && "bg-soft text-ink hover:bg-line",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-teal",
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  name,
  color,
  size = 36,
  letter,
  imageUrl,
}: {
  name: string;
  color: string;
  size?: number;
  /** Override initials (e.g. brand letter “E”) */
  letter?: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  const mark = (letter || initials(name)).slice(0, 2);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.34 }}
      aria-hidden
    >
      {mark}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-soft/60 px-6 py-16 text-center animate-fade-in">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function Badge({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "blurple" | "salmon" | "mint" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tone === "soft" && "bg-soft text-muted",
        tone === "blurple" && "bg-blurple/10 text-blurple",
        tone === "salmon" && "bg-salmon/10 text-salmon",
        tone === "mint" && "bg-mint/10 text-mint",
      )}
    >
      {children}
    </span>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
        <span>{message}</span>
        <button type="button" className="opacity-70 hover:opacity-100" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
