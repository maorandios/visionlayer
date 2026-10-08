"use client";

import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { fillBuckets, formatCount, formatSeconds, rangeFor } from "@/lib/metrics";
import type { MetricsBreakdown, MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

function BreakdownList({
  items,
  nameOf,
}: {
  items: { key: string; value: number }[];
  nameOf: (id: string) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">{nameOf(it.key)}</span>
            <span className="text-ink-muted tabular-nums">{formatCount(it.value)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-ink" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CameraMetricsPanel({
  cameraId,
  virtualCam,
  zoneName,
  lineName,
}: {
  cameraId: string;
  virtualCam: boolean;
  zoneName: (id: string | null | undefined) => string;
  lineName: (id: string | null | undefined) => string;
}) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [series, setSeries] = useState<MetricsTimeseries | null>(null);
  const [byZone, setByZone] = useState<MetricsBreakdown | null>(null);
  const [byLine, setByLine] = useState<MetricsBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const filters = {
          scope: (virtualCam ? "video_lab" : "production") as "video_lab" | "production",
          camera_id: cameraId,
          ...(virtualCam ? {} : rangeFor("today")),
        };
        const [s, ts, z, l] = await Promise.all([
          api.metrics.summary(token, filters),
          api.metrics.timeseries(token, "zone_entries", "hour", filters),
          api.metrics.breakdown(token, "zone_entries", "zone", filters),
          api.metrics.breakdown(token, "line_crossings", "line", filters),
        ]);
        if (cancelled) return;
        setSummary(s);
        setSeries(ts);
        setByZone(z);
        setByLine(l);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, cameraId, virtualCam]);

  if (loading) return <LoadingBlock />;
  if (!summary) return <EmptyBlock message={t("noMetricsYet")} />;

  const totals = summary.totals;
  const empty = totals.zone_entries === 0 && totals.line_crossings === 0 && totals.unique_objects === 0;
  if (empty) return <EmptyBlock message={t("noMetricsYet")} />;

  return (
    <div className="space-y-4" data-testid="camera-tab-metrics">
      {virtualCam ? <Chip tone="dashed">{t("scopeVideoLab")}</Chip> : null}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label={t("uniqueObjects")} value={formatCount(totals.unique_objects)} />
        <KpiCard label={t("zoneEntries")} value={formatCount(totals.zone_entries)} />
        <KpiCard label={t("lineCrossings")} value={formatCount(totals.line_crossings)} />
        <KpiCard label={t("avgDwell")} value={formatSeconds(summary.dwell.avg_seconds)} />
      </div>
      {!virtualCam ? (
        <Card>
          <SectionHeader title={t("entriesByHour")} />
          <BarChart points={fillBuckets(series, "today")} />
        </Card>
      ) : null}
      {summary.occupancy.length > 0 ? (
        <Card>
          <SectionHeader title={t("occupancyNow")} />
          <ul className="divide-y divide-border text-sm">
            {summary.occupancy.map((o, i) => (
              <li key={`${o.zone_id}-${i}`} className="flex items-center justify-between py-2">
                <span className="text-ink">{zoneName(o.zone_id)}</span>
                <span className="text-ink-muted">
                  {o.current} · {t("occupancyPeak")} {o.peak}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {(byZone?.items.length ?? 0) > 0 ? (
        <Card>
          <SectionHeader title={`${t("zoneEntries")} ${t("byZone")}`} />
          <BreakdownList items={byZone!.items} nameOf={zoneName} />
        </Card>
      ) : null}
      {(byLine?.items.length ?? 0) > 0 ? (
        <Card>
          <SectionHeader title={`${t("lineCrossings")} ${t("byLine")}`} />
          <BreakdownList items={byLine!.items} nameOf={lineName} />
        </Card>
      ) : null}
    </div>
  );
}
