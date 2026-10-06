import type { ReactNode } from "react";

type Tone = "neutral" | "solid" | "outline" | "dashed";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-ink",
  solid: "bg-ink text-surface",
  outline: "border border-border bg-surface text-ink",
  dashed: "border border-dashed border-border bg-surface text-ink-muted",
};

/** Small status/label chip. Grayscale only — tone conveys emphasis, not color. */
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
      className={`inline-flex h-6 shrink-0 items-center rounded-lg px-2 text-[11px] font-medium leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
