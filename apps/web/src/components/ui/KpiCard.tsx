import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/** Compact KPI tile: label → big value → optional hint. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex min-h-24 flex-col justify-between gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-ink-muted">{label}</p>
        {icon ? <span className="text-ink-muted">{icon}</span> : null}
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none text-ink tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}
