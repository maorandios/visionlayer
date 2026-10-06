import type { ReactNode } from "react";

/** Section title row used inside pages/cards. */
export function SectionHeader({
  title,
  hint,
  action,
  muted = false,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className={`text-sm font-medium ${muted ? "text-ink-muted" : "text-ink"}`}>{title}</h2>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
