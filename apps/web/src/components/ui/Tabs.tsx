"use client";

export type TabItem<T extends string> = { id: T; label: string; count?: number };

/**
 * Full-width panel tabs — equal segments that read as clear buttons.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
  fullWidth = false,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
  /** Stretch tabs evenly across the panel width. */
  fullWidth?: boolean;
}) {
  const height = size === "sm" ? "min-h-9 text-[11px] sm:text-xs" : "min-h-10 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-lg border border-border bg-black/25 p-1 backdrop-blur-md ${
        fullWidth ? "w-full" : "overflow-x-auto [scrollbar-width:none]"
      }`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex ${height} items-center justify-center gap-1 rounded-md px-2 font-medium transition ${
              fullWidth ? "min-w-0 flex-1" : "shrink-0 px-2.5"
            } ${
              active
                ? "bg-accent text-ink-on-accent shadow-soft"
                : "bg-transparent text-ink-muted hover:bg-white/5 hover:text-ink"
            }`}
          >
            <span className={fullWidth ? "truncate" : undefined}>{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={`rounded-sm px-1 text-[10px] tabular-nums ${
                  active ? "bg-ink-on-accent/15 text-ink-on-accent" : "bg-muted text-ink-faint"
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
