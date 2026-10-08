import type { ReactNode } from "react";

type Tone = "neutral" | "solid" | "outline" | "dashed" | "accent" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-ink-muted",
  solid: "bg-accent text-ink-on-accent",
  outline: "border border-border bg-surface text-ink-muted",
  dashed: "border border-dashed border-border-strong bg-surface/60 text-ink-faint",
  accent: "bg-accent-soft text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Compact status/label chip — restrained radius. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-[10px] font-medium leading-none tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
