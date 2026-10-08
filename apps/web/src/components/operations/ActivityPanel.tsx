"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MetricWizard } from "@/components/metrics/wizard/MetricWizard";
import { MetricWidget } from "@/components/operations/MetricWidget";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { BarChart } from "@/components/ui/BarChart";
import { Card } from "@/components/ui/Card";
import { t } from "@/i18n/he";
import {
  buildWidgetsFromDefinitions,
  engineMetricType,
  filtersForDefinition,
} from "@/lib/activity-from-definitions";
import { groupWidgets, gridClassForCount } from "@/lib/activity-metrics";
import { api } from "@/lib/api";
import type { MetricDefinition } from "@/lib/metric-wizard/types";
import { fillBuckets, rangeFor, type RangeKey, RANGE_OPTIONS } from "@/lib/metrics";
import type { Line, MetricsSummary, MetricsTimeseries, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  cameraId: string;
  virtualCam: boolean;
  zones: Zone[];
  lines: Line[];
  zoneName: (id: string | null | undefined) => string;
  onCatalogRefresh?: () => void;
};

type PanelMode =
  | { kind: "main" }
  | { kind: "create" }
  | { kind: "edit"; def: MetricDefinition };

/**
 * Activity = continuous measurements from Metric Definitions (not Rule events).
 */
export function ActivityPanel({
  cameraId,
  virtualCam,
  zones,
  lines,
  onCatalogRefresh,
}: Props) {
  const { token } = useAuth();
  const [range, setRange] = useState<RangeKey>("today");
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [summaries, setSummaries] = useState<Record<string, MetricsSummary | null>>({});
  const [series, setSeries] = useState<Record<string, MetricsTimeseries | null>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PanelMode>({ kind: "main" });
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MetricDefinition | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const defs = await api.metricDefinitions.list(token, cameraId);
      setDefinitions(defs);
      const enabled = defs.filter((d) => d.enabled);
      const nextSummaries: Record<string, MetricsSummary | null> = {};
      const nextSeries: Record<string, MetricsTimeseries | null> = {};
      const bucket = range === "today" ? ("hour" as const) : ("day" as const);

      await Promise.all(
        enabled.map(async (def) => {
          const filters = {
            scope: (virtualCam ? "video_lab" : "production") as "video_lab" | "production",
            camera_id: cameraId,
            ...(virtualCam ? {} : rangeFor(range)),
            ...filtersForDefinition(def),
          };
          try {
            nextSummaries[def.id] = await api.metrics.summary(token, filters);
          } catch {
            nextSummaries[def.id] = null;
          }
          const eng = engineMetricType(def);
          if (eng === "line_crossings" || eng === "unique_objects" || eng === "zone_entries") {
            try {
              nextSeries[def.id] = await api.metrics.timeseries(
                token,
                eng as "line_crossings" | "unique_objects" | "zone_entries",
                bucket,
                filters,
              );
            } catch {
              nextSeries[def.id] = null;
            }
          }
        }),
      );
      setSummaries(nextSummaries);
      setSeries(nextSeries);
    } catch {
      setDefinitions([]);
    } finally {
      setLoading(false);
    }
  }, [token, cameraId, virtualCam, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const tmr = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(tmr);
  }, [toast]);

  const rangeLabel =
    range === "today" ? t("rangeToday") : range === "7d" ? t("range7d") : t("range30d");

  const widgets = useMemo(
    () =>
      buildWidgetsFromDefinitions({
        definitions,
        summaries,
        series,
        rangeLabel,
      }),
    [definitions, summaries, series, rangeLabel],
  );

  const groups = useMemo(() => groupWidgets(widgets), [widgets]);
  const gridCls = gridClassForCount(widgets.length);

  async function toggleEnabled(def: MetricDefinition) {
    if (!token) return;
    await api.metricDefinitions.update(token, def.id, { enabled: !def.enabled });
    await load();
  }

  async function deleteDef(def: MetricDefinition) {
    if (!token) return;
    setBusy(true);
    try {
      await api.metricDefinitions.delete(token, def.id);
      setConfirmDelete(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (mode.kind === "create" || mode.kind === "edit") {
    return (
      <div data-testid="camera-tab-activity" className="h-full min-h-[20rem]">
        <MetricWizard
          cameraId={cameraId}
          mode={mode.kind === "edit" ? "edit" : "create"}
          initial={mode.kind === "edit" ? mode.def : null}
          zones={zones}
          lines={lines}
          onExit={() => setMode({ kind: "main" })}
          onSpatialCreated={() => void onCatalogRefresh?.()}
          onSaved={(def) => {
            const wasEdit = mode.kind === "edit";
            setMode({ kind: "main" });
            setToast(`${wasEdit ? "המדד עודכן" : "המדד נוצר"} · ${def.name}`);
            void onCatalogRefresh?.();
            void load();
          }}
        />
      </div>
    );
  }

  if (loading) return <LoadingBlock />;

  if (definitions.length === 0) {
    return (
      <div className="space-y-4" data-testid="camera-tab-activity">
        <EmptyBlock
          message={t("activityEmptyTitle")}
          hint={t("activityEmptyBody")}
          action={
            <Button onClick={() => setMode({ kind: "create" })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("activityFirstMetricCta")}
            </Button>
          }
        />
      </div>
    );
  }

  const chartDef = definitions.find(
    (d) => d.enabled && (d.metric_type === "entries" || d.metric_type === "line_crossings"),
  );
  const chartSeries = chartDef ? series[chartDef.id] : null;

  return (
    <div className="space-y-4" data-testid="camera-tab-activity">
      {toast ? (
        <div className="glass rounded-lg px-3 py-2 text-sm text-ink" role="status">
          ✓ {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRange(opt.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range === opt.id
                  ? "bg-accent text-ink-on-accent"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "create" })}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("addMetricCta")}
        </Button>
      </div>

      {virtualCam ? <Chip tone="dashed">{t("scopeVideoLab")}</Chip> : null}

      {widgets.length === 0 ? (
        <EmptyBlock
          message="כל המדדים מושבתים"
          hint="הפעילו מדד קיים או הוסיפו מדד חדש."
          action={
            <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "create" })}>
              {t("addMetricCta")}
            </Button>
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.id} className="space-y-2">
            <SectionHeader title={g.label} />
            <div className={`grid gap-2.5 ${gridCls}`}>
              {g.items.map((w) => {
                const def = definitions.find((d) => d.id === w.id);
                return (
                  <MetricWidget
                    key={w.id}
                    widget={{ ...w, enabled: def?.enabled }}
                    prominence={widgets.length === 1 ? "hero" : "normal"}
                    menu={
                      def
                        ? {
                            enabled: def.enabled,
                            onEdit: () => setMode({ kind: "edit", def }),
                            onToggleEnabled: () => void toggleEnabled(def),
                            onDelete: () => setConfirmDelete(def),
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Show disabled metrics in a compact management row */}
      {definitions.some((d) => !d.enabled) ? (
        <section className="space-y-2">
          <SectionHeader title="מושבתים" />
          <ul className="space-y-1">
            {definitions
              .filter((d) => !d.enabled)
              .map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-ink-muted"
                >
                  <span>{d.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setMode({ kind: "edit", def: d })}>
                      עריכה
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void toggleEnabled(d)}>
                      הפעל
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {!virtualCam && chartSeries ? (
        <Card className="p-3">
          <SectionHeader title={t("entriesByHour")} />
          <BarChart points={fillBuckets(chartSeries, range)} />
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!confirmDelete}
        title="מחיקת מדד"
        description="המדד יוסר מהמצלמה. נתונים היסטוריים במנוע המדדים לא יימחקו אוטומטית."
        confirmLabel="מחק"
        onConfirm={() => confirmDelete && void deleteDef(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        busy={busy}
      />
    </div>
  );
}
