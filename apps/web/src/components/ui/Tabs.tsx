"use client";

export type TabItem<T extends string> = { id: T; label: string; count?: number };

/**
 * Segmented tabs. Horizontally scrollable on mobile, 44px touch targets.
 * Works both as page tabs and as a filter/segmented control.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  const height = size === "sm" ? "min-h-9 text-xs" : "min-h-11 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
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
            className={`inline-flex ${height} shrink-0 items-center gap-1.5 rounded-xl px-3 font-medium transition ${
              active ? "bg-ink text-surface" : "bg-muted text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={`rounded-md px-1.5 text-[11px] ${active ? "bg-surface/20" : "bg-surface"}`}
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
