"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  selected?: boolean;
  disabled?: boolean;
  /** Small note shown instead of the description when the choice is not available. */
  unavailableNote?: string;
  onClick?: () => void;
  size?: "md" | "lg";
  children?: ReactNode;
  testId?: string;
};

/** Large touch-friendly selectable card. One decision per step, no form controls. */
export function ChoiceCard({
  title,
  description,
  icon: Icon,
  selected = false,
  disabled = false,
  unavailableNote,
  onClick,
  size = "md",
  children,
  testId,
}: Props) {
  const pad = size === "lg" ? "p-5 md:p-6" : "p-4";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={testId}
      className={`group relative flex w-full items-start gap-3 rounded-2xl border text-start transition ${pad} ${
        selected
          ? "border-ink bg-ink text-surface shadow-sm"
          : "border-border bg-surface text-ink hover:border-ink/40 hover:bg-muted/60"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {Icon ? (
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            selected ? "bg-surface/15 text-surface" : "bg-muted text-ink"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block font-medium ${size === "lg" ? "text-base" : "text-sm"}`}>{title}</span>
        {unavailableNote ? (
          <span className={`mt-0.5 block text-xs ${selected ? "text-surface/80" : "text-ink-muted"}`}>
            {unavailableNote}
          </span>
        ) : description ? (
          <span className={`mt-0.5 block text-xs leading-relaxed ${selected ? "text-surface/80" : "text-ink-muted"}`}>
            {description}
          </span>
        ) : null}
        {children}
      </span>
      {selected ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

/** Small selectable pill (durations, thresholds, weekdays). */
export function ChoicePill({
  label,
  selected,
  onClick,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
        selected ? "border-ink bg-ink text-surface" : "border-border bg-surface text-ink hover:bg-muted"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
