/**
 * Map persisted MetricDefinitions + Metrics Engine summaries into Activity widgets.
 */
import { formatCount, formatSeconds } from "@/lib/metrics";
import type { MetricDefinition } from "@/lib/metric-wizard/types";
import type { MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { metricTypeConfig, type MetricDefType } from "@/lib/vision-capabilities";
import type { ActivityGroupId, ActivityWidget, ActivityWidgetVariant } from "@/lib/activity-metrics";

export function groupIdForMetricType(metricType: MetricDefType): ActivityGroupId {
  const cfg = metricTypeConfig(metricType);
  if (cfg.realtime) return "now";
  if (metricType.startsWith("dwell") || metricType === "occupancy_peak") return "behavior";
  return "today";
}

export function variantFor(metricType: MetricDefType): ActivityWidgetVariant {
  switch (metricType) {
    case "occupancy_current":
      return "current";
    case "dwell_avg":
    case "dwell_max":
      return "duration";
    case "occupancy_peak":
      return "peak";
    case "entries":
    case "exits":
    case "line_crossings":
      return "trend";
    default:
      return "counter";
  }
}

/** Engine metric_type used when querying samples for a definition. */
export function engineMetricType(def: MetricDefinition): string {
  if (def.engine_metric_type) return def.engine_metric_type;
  switch (def.metric_type) {
    case "entries":
    case "exits":
    case "line_crossings":
      return "line_crossings";
    case "occupancy_peak":
    case "occupancy_current":
      return "occupancy_peak";
    case "dwell_avg":
    case "dwell_max":
      return "dwell";
    case "objects_observed":
      return "unique_objects";
    default:
      return "unique_objects";
  }
}

export function filtersForDefinition(def: MetricDefinition): {
  zone_id?: string;
  line_id?: string;
  object_class?: string;
  direction?: string;
} {
  const f: {
    zone_id?: string;
    line_id?: string;
    object_class?: string;
    direction?: string;
  } = {};
  if (def.zone_id) f.zone_id = def.zone_id;
  if (def.line_id) f.line_id = def.line_id;
  // Prefer logical group key when vehicle/person so API expands classes.
  f.object_class = def.object_type;
  if (def.direction && def.direction !== "any") f.direction = def.direction;
  return f;
}

export function valueFromSummary(def: MetricDefinition, summary: MetricsSummary | null): {
  value: string;
  context?: string;
} {
  if (!summary) return { value: "—" };

  switch (def.metric_type) {
    case "occupancy_current": {
      const occ = def.zone_id
        ? summary.occupancy.find((o) => o.zone_id === def.zone_id)
        : summary.occupancy[0];
      return { value: formatCount(occ?.current ?? 0), context: "עכשיו" };
    }
    case "occupancy_peak": {
      const occ = def.zone_id
        ? summary.occupancy.find((o) => o.zone_id === def.zone_id)
        : summary.occupancy[0];
      const peak = occ?.peak ?? summary.peak_occupancy ?? 0;
      const when = occ?.peak_at
        ? new Date(occ.peak_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : undefined;
      return { value: formatCount(peak), context: when };
    }
    case "dwell_avg":
      return { value: formatSeconds(summary.dwell.avg_seconds) };
    case "dwell_max":
      return { value: formatSeconds(summary.dwell.max_seconds) };
    case "objects_observed":
      return { value: formatCount(summary.totals.unique_objects) };
    case "entries":
    case "exits":
    case "line_crossings":
      return { value: formatCount(summary.totals.line_crossings) };
    default:
      return { value: formatCount(summary.totals.unique_objects) };
  }
}

export function buildWidgetsFromDefinitions(opts: {
  definitions: MetricDefinition[];
  /** Per-definition summary keyed by definition id. */
  summaries: Record<string, MetricsSummary | null>;
  series?: Record<string, MetricsTimeseries | null>;
  rangeLabel: string;
}): ActivityWidget[] {
  const { definitions, summaries, series = {}, rangeLabel } = opts;
  const widgets: ActivityWidget[] = [];

  for (const def of definitions) {
    if (!def.enabled) continue;
    const { value, context } = valueFromSummary(def, summaries[def.id] ?? null);
    const pts = series[def.id]?.points?.map((p) => p.value);
    widgets.push({
      id: def.id,
      kind: def.metric_type as ActivityWidget["kind"],
      group: groupIdForMetricType(def.metric_type),
      label: def.name,
      value,
      context: metricTypeConfig(def.metric_type).realtime ? context : context ?? rangeLabel,
      variant: variantFor(def.metric_type),
      trend: pts && pts.length > 1 ? pts : undefined,
      realtime: !!metricTypeConfig(def.metric_type).realtime,
      zoneId: def.zone_id,
      objectClass: def.object_type,
    });
  }

  return widgets;
}
