"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { objectClassHe } from "@/lib/format";
import { DIRECTION_HE, formatCount, formatSeconds } from "@/lib/metrics";
import type { MetricsBreakdown, MetricsSummary } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  runId: string;
  cameraId: string;
  lineName: (id: string | null | undefined) => string;
  zoneName: (id: string | null | undefined) => string;
};

/**
 * Per-run metrics from the real Metrics Engine (scope=video_lab, analysis_run_id=run).
 * Example: 7 cars + 2 trucks crossing "Gate A" → line crossings 9 (car 7 · truck 2).
 */
export function RunMetrics({ runId, cameraId, lineName, zoneName }: Props) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [byLine, setByLine] = useState<MetricsBreakdown | null>(null);
  const [crossByClass, setCrossByClass] = useState<MetricsBreakdown | null>(null);
  const [entriesByZone, setEntriesByZone] = useState<MetricsBreakdown | null>(null);
  const [byDirection, setByDirection] = useState<MetricsBreakdown | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const filters = { scope: "video_lab" as const, analysis_run_id: runId, camera_id: cameraId };
    (async () => {
      try {
        const [s, l, c, z, d] = await Promise.all([
          api.metrics.summary(token, filters),
          api.metrics.breakdown(token, "line_crossings", "line", filters),
          api.metrics.breakdown(token, "line_crossings", "object_class", filters),
          api.metrics.breakdown(token, "zone_entries", "zone", filters),
          api.metrics.breakdown(token, "line_crossings", "direction", filters),
        ]);
        if (cancelled) return;
        setSummary(s);
        setByLine(l);
        setCrossByClass(c);
        setEntriesByZone(z);
        setByDirection(d);
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, runId, cameraId]);

  if (!summary) return null;
  const totals = summary.totals;

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-sm" data-testid="run-metrics">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">{t("openMetricsForRun")}</h3>
        <Chip tone="dashed">scope: video_lab</Chip>
      </div>
      <p className="mb-3 text-xs text-ink-muted">{t("videoLabMetricsHint")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t("uniqueObjects")} value={formatCount(totals.unique_objects)} />
        <Stat label={t("lineCrossings")} value={formatCount(totals.line_crossings)} />
        <Stat label={t("zoneEntries")} value={formatCount(totals.zone_entries)} />
        <Stat label={t("avgDwell")} value={formatSeconds(summary.dwell.avg_seconds)} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BreakdownBlock
          title={`${t("lineCrossings")} ${t("byLine")}`}
          items={byLine?.items ?? []}
          nameOf={(k) => lineName(k)}
        />
        <BreakdownBlock
          title={`${t("lineCrossings")} ${t("byClass")}`}
          items={crossByClass?.items ?? []}
          nameOf={(k) => objectClassHe(k)}
        />
        <BreakdownBlock
          title={`${t("zoneEntries")} ${t("byZone")}`}
          items={entriesByZone?.items ?? []}
          nameOf={(k) => zoneName(k)}
        />
        <BreakdownBlock
          title={`${t("lineCrossings")} · ${t("directionLabel")}`}
          items={byDirection?.items ?? []}
          nameOf={(k) => DIRECTION_HE[k] ?? k}
        />
      </div>
      {summary.occupancy.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-ink">{t("occupancyPeak")}</p>
          <ul className="space-y-1 text-xs text-ink-muted">
            {summary.occupancy.map((o) => (
              <li key={`${o.zone_id}-${o.current}-${o.peak}`} className="flex justify-between">
                <span>{zoneName(o.zone_id)}</span>
                <span className="text-ink">{o.peak}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink tabular-nums">{value}</p>
    </div>
  );
}

function BreakdownBlock({
  title,
  items,
  nameOf,
}: {
  title: string;
  items: { key: string; value: number }[];
  nameOf: (key: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">{title}</p>
      <ul className="space-y-1 text-xs text-ink-muted">
        {items.map((it) => (
          <li key={it.key} className="flex justify-between">
            <span>{nameOf(it.key)}</span>
            <span className="text-ink tabular-nums">{formatCount(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
