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
  unavailableNote?: string;
  onClick?: () => void;
  size?: "md" | "lg";
  children?: ReactNode;
  testId?: string;
};

/** Selectable decision card — accent selected state, restrained radius. */
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
  const pad = size === "lg" ? "p-4 md:p-5" : "p-3.5";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={testId}
      className={`group relative flex w-full items-start gap-3 rounded-lg border text-start transition ${pad} ${
        selected
          ? "border-accent bg-accent-soft text-ink shadow-soft"
          : "border-border bg-black/25 text-ink backdrop-blur-sm hover:border-white/20 hover:bg-white/5"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {Icon ? (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
            selected ? "bg-accent/20 text-accent" : "bg-muted text-ink-muted"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block font-medium ${size === "lg" ? "text-base" : "text-sm"}`}>{title}</span>
        {unavailableNote ? (
          <span className={`mt-0.5 block text-xs ${selected ? "text-ink-muted" : "text-ink-faint"}`}>
            {unavailableNote}
          </span>
        ) : description ? (
          <span className={`mt-0.5 block text-xs leading-relaxed ${selected ? "text-ink-muted" : "text-ink-faint"}`}>
            {description}
          </span>
        ) : null}
        {children}
      </span>
      {selected ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-accent text-ink-on-accent">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
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
      className={`inline-flex min-h-10 items-center justify-center rounded-md border px-3.5 text-sm font-medium transition ${
        selected
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-surface text-ink hover:bg-muted"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
