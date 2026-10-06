"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { objectClassHe } from "@/lib/format";
import { RANGE_OPTIONS, fillBuckets, formatCount, formatSeconds, rangeFor, rangeLabel, type RangeKey } from "@/lib/metrics";
import { isDevEnvironment } from "@/lib/navigation";
import type { MetricBreakdownBy, MetricScope, MetricsBreakdown, MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";

type BreakdownTab = Extract<MetricBreakdownBy, "camera" | "object_class" | "zone">;

const BREAKDOWN_TABS: { id: BreakdownTab; label: string }[] = [
  { id: "camera", label: t("byCamera") },
  { id: "object_class", label: t("byClass") },
  { id: "zone", label: t("byZone") },
];

export default function InsightsPage() {
  const { token, hub } = useAuth();
  const { cameraName, zoneName } = useCatalog();
  const devMode = isDevEnvironment(hub);

  const [range, setRange] = useState<RangeKey>("today");
  const [scope, setScope] = useState<MetricScope>("production");
  const [breakdownBy, setBreakdownBy] = useState<BreakdownTab>("camera");
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [series, setSeries] = useState<MetricsTimeseries | null>(null);
  const [breakdown, setBreakdown] = useState<MetricsBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo(() => ({ scope, ...rangeFor(range) }), [scope, range]);
  const bucket = range === "today" ? "hour" : "day";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, ts] = await Promise.all([
          api.metrics.summary(token, filters),
          api.metrics.timeseries(token, "zone_entries", bucket, filters),
        ]);
        if (cancelled) return;
        setSummary(s);
        setSeries(ts);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errorLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, filters, bucket, reloadKey]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const metric = breakdownBy === "object_class" ? "unique_objects" : "zone_entries";
        const b = await api.metrics.breakdown(token, metric, breakdownBy, filters);
        if (!cancelled) setBreakdown(b);
      } catch {
        if (!cancelled) setBreakdown(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, filters, breakdownBy, reloadKey]);

  if (loading && !summary) return <LoadingBlock />;
  if (error && !summary) return <ErrorBlock message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  const totals = summary?.totals;
  const vehicles = summary?.vehicles?.unique_objects ?? 0;
  const persons = summary?.persons?.unique_objects ?? 0;
  const eventsTotal = totals?.events_total ?? 0;
  const avgDwell = summary?.dwell?.avg_seconds ?? 0;
  const noData =
    !summary ||
    ((totals?.zone_entries ?? 0) === 0 &&
      (totals?.line_crossings ?? 0) === 0 &&
      (totals?.unique_objects ?? 0) === 0 &&
      eventsTotal === 0);

  const nameFor = (key: string) =>
    breakdownBy === "camera" ? cameraName(key) : breakdownBy === "zone" ? zoneName(key) : objectClassHe(key);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("insightsTitle")}
        subtitle={t("insightsSubtitle")}
        badge={scope === "video_lab" ? <Chip tone="dashed">{t("scopeVideoLab")}</Chip> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={RANGE_OPTIONS} value={range} onChange={setRange} ariaLabel={t("scheduleLabel")} size="sm" />
        {devMode ? (
          <div data-testid="insights-scope">
            <Tabs
              size="sm"
              ariaLabel="scope"
              value={scope}
              onChange={setScope}
              items={[
                { id: "production", label: t("scopeProduction") },
                { id: "video_lab", label: t("scopeVideoLab") },
              ]}
            />
          </div>
        ) : null}
      </div>
      {devMode && scope === "video_lab" ? <p className="text-xs text-ink-muted">{t("scopeHint")}</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="insights-kpis">
        <KpiCard label={t("vehiclesToday").replace("היום", rangeLabel(range))} value={formatCount(vehicles)} />
        <KpiCard label={t("peopleToday").replace("היום", rangeLabel(range))} value={formatCount(persons)} />
        <KpiCard label={t("eventsToday").replace("היום", rangeLabel(range))} value={formatCount(eventsTotal)} />
        <KpiCard label={t("avgDwell")} value={formatSeconds(avgDwell)} hint={`${formatCount(summary?.dwell?.sessions ?? 0)} ${t("dwellSessions")}`} />
      </div>

      {noData ? (
        <EmptyBlock message={t("noInsightsYet")} hint={t("noInsightsHint")} />
      ) : (
        <>
          <Card data-testid="insights-trend">
            <SectionHeader title={range === "today" ? t("entriesByHour") : t("entriesByDay")} />
            <BarChart points={fillBuckets(series, range)} />
          </Card>

          <Card data-testid="insights-breakdown">
            <SectionHeader title={t("breakdownLabel")} />
            <Tabs items={BREAKDOWN_TABS} value={breakdownBy} onChange={setBreakdownBy} size="sm" ariaLabel={t("breakdownLabel")} />
            {!breakdown || breakdown.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-muted">{t("noInsightsYet")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {breakdown.items.map((it) => {
                  const max = Math.max(...breakdown.items.map((x) => x.value), 1);
                  return (
                    <li key={it.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink">{nameFor(it.key)}</span>
                        <span className="text-ink-muted tabular-nums">{formatCount(it.value)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-ink" style={{ width: `${(it.value / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {summary && summary.occupancy.length > 0 ? (
            <Card data-testid="insights-occupancy">
              <SectionHeader title={t("occupancyNow")} />
              <ul className="divide-y divide-border text-sm">
                {summary.occupancy.map((o) => (
                  <li key={`${o.camera_id}-${o.zone_id}`} className="flex items-center justify-between py-2">
                    <span className="text-ink">
                      {cameraName(o.camera_id)} · {zoneName(o.zone_id)}
                    </span>
                    <span className="text-ink-muted tabular-nums">
                      {o.current} · {t("occupancyPeak")} {o.peak}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
