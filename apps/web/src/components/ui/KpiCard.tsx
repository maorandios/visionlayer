import type { ReactNode } from "react";

/** Elevated metric module — brighter surface for dark UI readability. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  size?: "md" | "lg";
}) {
  const pad = size === "lg" ? "min-h-[5.75rem] p-4" : "min-h-[4.5rem] p-3";
  const valueCls = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div
      className={`glass flex flex-col justify-between gap-2 rounded-lg ${pad}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon ? <span className="text-ink-faint">{icon}</span> : null}
      </div>
      <div>
        <p className={`${valueCls} font-semibold leading-none tracking-tight text-ink tabular-nums`}>{value}</p>
        {hint ? <p className="mt-1 text-[11px] text-ink-faint">{hint}</p> : null}
      </div>
    </div>
  );
}
