/**
 * Activity tab — maps Metrics Engine data into user-facing widgets.
 * Per-camera enabled metric ids are stored in localStorage (no extra AI / backend defs).
 */
import type { MetricsSummary, MetricsTimeseries } from "@/lib/types";
import { formatCount, formatSeconds } from "@/lib/metrics";

export type ActivityGroupId = "now" | "today" | "behavior";

export type ActivityMetricKind =
  | "zone_entries"
  | "zone_exits"
  | "line_crossings"
  | "unique_objects"
  | "occupancy_current"
  | "occupancy_peak"
  | "dwell_avg"
  | "dwell_max"
  | "dwell_sessions"
  | "persons_entries"
  | "vehicles_entries"
  | "class_entries";

export type ActivityWidgetVariant = "counter" | "current" | "duration" | "peak" | "trend" | "breakdown";

export type ActivityWidget = {
  id: string;
  /** MetricDefinition.metric_type or legacy ActivityMetricKind. */
  kind: ActivityMetricKind | string;
  group: ActivityGroupId;
  label: string;
  value: string;
  unit?: string;
  context?: string;
  variant: ActivityWidgetVariant;
  /** Optional sparkline points (0–n). */
  trend?: number[];
  breakdown?: { label: string; value: string }[];
  realtime?: boolean;
  zoneId?: string | null;
  objectClass?: string | null;
  enabled?: boolean;
};

export type MetricTemplate = {
  kind: ActivityMetricKind;
  label: string;
  hint: string;
  group: ActivityGroupId;
  needs: "none" | "zone" | "line";
  objectClass?: string;
};

export const METRIC_TEMPLATES: MetricTemplate[] = [
  { kind: "zone_entries", label: "ספירת כניסות לאזור", hint: "כמה פעמים נכנסו לאזור", group: "today", needs: "zone" },
  { kind: "zone_exits", label: "ספירת יציאות מאזור", hint: "כמה פעמים יצאו מאזור", group: "today", needs: "zone" },
  { kind: "line_crossings", label: "חציית קו", hint: "ספירת מעברים על קו", group: "today", needs: "line" },
  { kind: "occupancy_current", label: "תפוסה עכשיו", hint: "כמה אובייקטים באזור כרגע", group: "now", needs: "zone" },
  { kind: "occupancy_peak", label: "שיא תפוסה", hint: "השיא בתקופה הנבחרת", group: "behavior", needs: "zone" },
  { kind: "dwell_avg", label: "זמן שהייה ממוצע", hint: "כמה זמן נשארים באזור בממוצע", group: "behavior", needs: "zone" },
  { kind: "dwell_max", label: "זמן שהייה מקסימלי", hint: "השהייה הארוכה ביותר", group: "behavior", needs: "zone" },
  { kind: "dwell_sessions", label: "שהיות שהושלמו", hint: "מספר סשנים שהסתיימו", group: "behavior", needs: "zone" },
  { kind: "persons_entries", label: "כניסות אנשים", hint: "כניסות מסוג אדם", group: "today", needs: "none", objectClass: "person" },
  { kind: "vehicles_entries", label: "כניסות רכבים", hint: "כניסות רכב / משאית / אופנוע", group: "today", needs: "none" },
  { kind: "unique_objects", label: "אובייקטים ייחודיים", hint: "זהויות מעקב ייחודיות בתקופה (לא זהות אדם קבועה)", group: "today", needs: "none" },
];

export const GROUP_LABEL: Record<ActivityGroupId, string> = {
  now: "עכשיו",
  today: "היום",
  behavior: "זמן והתנהגות",
};

const STORAGE_PREFIX = "vl.camera.activity.metrics.v1:";

export type StoredMetricPref = {
  id: string;
  kind: ActivityMetricKind;
  zoneId?: string | null;
  lineId?: string | null;
  objectClass?: string | null;
  label?: string;
};

export function loadMetricPrefs(cameraId: string): StoredMetricPref[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cameraId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMetricPref[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMetricPrefs(cameraId: string, prefs: StoredMetricPref[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_PREFIX + cameraId, JSON.stringify(prefs));
}

/** Seed defaults when camera has spatial setup but no saved prefs. */
export function defaultPrefsForCamera(opts: {
  hasZones: boolean;
  hasLines: boolean;
}): StoredMetricPref[] {
  const prefs: StoredMetricPref[] = [];
  if (opts.hasZones) {
    prefs.push(
      { id: "occupancy_current", kind: "occupancy_current" },
      { id: "zone_entries", kind: "zone_entries" },
      { id: "dwell_avg", kind: "dwell_avg" },
    );
  }
  if (opts.hasLines) {
    prefs.push({ id: "line_crossings", kind: "line_crossings" });
  }
  if (prefs.length === 0) {
    // No spatial primitives yet — empty activity (user must add first metric).
    return [];
  }
  prefs.push({ id: "persons_entries", kind: "persons_entries", objectClass: "person" });
  prefs.push({ id: "vehicles_entries", kind: "vehicles_entries" });
  return prefs;
}

function sparkFromSeries(series: MetricsTimeseries | null | undefined): number[] | undefined {
  const pts = series?.points ?? [];
  if (pts.length < 2) return undefined;
  return pts.map((p) => p.value);
}

export function buildActivityWidgets(opts: {
  prefs: StoredMetricPref[];
  summary: MetricsSummary | null;
  seriesByKind?: Partial<Record<ActivityMetricKind, MetricsTimeseries | null>>;
  zoneName: (id: string | null | undefined) => string;
  rangeLabel: string;
}): ActivityWidget[] {
  const { prefs, summary, seriesByKind = {}, zoneName, rangeLabel } = opts;
  if (!summary) return [];

  const widgets: ActivityWidget[] = [];

  for (const pref of prefs) {
    const tpl = METRIC_TEMPLATES.find((x) => x.kind === pref.kind);
    const label = pref.label ?? tpl?.label ?? pref.kind;

    switch (pref.kind) {
      case "zone_entries":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(summary.totals.zone_entries),
          context: rangeLabel,
          variant: "trend",
          trend: sparkFromSeries(seriesByKind.zone_entries),
          zoneId: pref.zoneId,
        });
        break;
      case "zone_exits":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(summary.totals.zone_exits),
          context: rangeLabel,
          variant: "counter",
          zoneId: pref.zoneId,
        });
        break;
      case "line_crossings":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(summary.totals.line_crossings),
          context: rangeLabel,
          variant: "trend",
          trend: sparkFromSeries(seriesByKind.line_crossings),
        });
        break;
      case "unique_objects":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(summary.totals.unique_objects),
          context: "זהויות מעקב בתקופה",
          variant: "counter",
        });
        break;
      case "occupancy_current": {
        const occ = pref.zoneId
          ? summary.occupancy.find((o) => o.zone_id === pref.zoneId)
          : summary.occupancy[0];
        const current = occ?.current ?? 0;
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "now",
          label,
          value: formatCount(current),
          context: occ ? zoneName(occ.zone_id) : undefined,
          variant: "current",
          realtime: true,
          zoneId: occ?.zone_id ?? pref.zoneId,
        });
        break;
      }
      case "occupancy_peak": {
        const occ = pref.zoneId
          ? summary.occupancy.find((o) => o.zone_id === pref.zoneId)
          : summary.occupancy[0];
        const peak = occ?.peak ?? summary.peak_occupancy ?? 0;
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "behavior",
          label,
          value: formatCount(peak),
          context: occ?.peak_at ? new Date(occ.peak_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : rangeLabel,
          variant: "peak",
          zoneId: occ?.zone_id ?? pref.zoneId,
        });
        break;
      }
      case "dwell_avg":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "behavior",
          label,
          value: formatSeconds(summary.dwell.avg_seconds),
          variant: "duration",
          zoneId: pref.zoneId,
        });
        break;
      case "dwell_max":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "behavior",
          label,
          value: formatSeconds(summary.dwell.max_seconds),
          variant: "duration",
          zoneId: pref.zoneId,
        });
        break;
      case "dwell_sessions":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "behavior",
          label,
          value: formatCount(summary.dwell.sessions),
          context: rangeLabel,
          variant: "counter",
          zoneId: pref.zoneId,
        });
        break;
      case "persons_entries":
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(summary.persons?.zone_entries ?? 0),
          context: rangeLabel,
          variant: "counter",
          objectClass: "person",
        });
        break;
      case "vehicles_entries": {
        const v = summary.vehicles;
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label,
          value: formatCount(v?.zone_entries ?? 0),
          context: rangeLabel,
          variant: "breakdown",
          breakdown: (summary.by_class ?? [])
            .filter((c) => ["car", "truck", "motorcycle", "bus", "bicycle"].includes(c.object_class))
            .map((c) => ({
              label: classHe(c.object_class),
              value: formatCount(c.zone_entries),
            })),
        });
        break;
      }
      case "class_entries": {
        const cls = pref.objectClass ?? "person";
        const row = summary.by_class?.find((c) => c.object_class === cls);
        widgets.push({
          id: pref.id,
          kind: pref.kind,
          group: "today",
          label: pref.label ?? classHe(cls),
          value: formatCount(row?.zone_entries ?? 0),
          context: rangeLabel,
          variant: "counter",
          objectClass: cls,
        });
        break;
      }
      default:
        break;
    }
  }

  return widgets;
}

export function groupWidgets(widgets: ActivityWidget[]): { id: ActivityGroupId; label: string; items: ActivityWidget[] }[] {
  const order: ActivityGroupId[] = ["now", "today", "behavior"];
  return order
    .map((id) => ({
      id,
      label: GROUP_LABEL[id],
      items: widgets.filter((w) => w.group === id),
    }))
    .filter((g) => g.items.length > 0);
}

function classHe(cls: string): string {
  const map: Record<string, string> = {
    person: "אדם",
    car: "מכונית",
    truck: "משאית",
    motorcycle: "אופנוע",
    bus: "אוטובוס",
    bicycle: "אופניים",
  };
  return map[cls] ?? cls;
}

export function gridClassForCount(n: number): string {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-2";
  if (n <= 8) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-3";
}
