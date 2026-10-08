import { describe, expect, it } from "vitest";
import { buildWidgetsFromDefinitions, filtersForDefinition } from "@/lib/activity-from-definitions";
import { groupWidgets, gridClassForCount } from "@/lib/activity-metrics";
import type { MetricDefinition } from "@/lib/metric-wizard/types";
import type { MetricsSummary } from "@/lib/types";

const def = (over: Partial<MetricDefinition> & Pick<MetricDefinition, "id" | "metric_type">): MetricDefinition => ({
  camera_id: "c1",
  name: over.name ?? over.metric_type,
  object_type: "person",
  object_classes: ["person"],
  scope_type: over.scope_type ?? "zone",
  zone_id: over.zone_id ?? "z1",
  line_id: over.line_id ?? null,
  direction: over.direction ?? null,
  enabled: over.enabled ?? true,
  created_at: "",
  updated_at: "",
  ...over,
});

const summary = (): MetricsSummary =>
  ({
    scope: "production",
    analysis_run_id: null,
    from: null,
    to: null,
    totals: {
      zone_entries: 0,
      zone_exits: 0,
      line_crossings: 12,
      unique_objects: 4,
      events_total: 0,
    },
    dwell: { sessions: 1, total_seconds: 60, avg_seconds: 60, max_seconds: 60 },
    occupancy: [{ camera_id: "c1", zone_id: "z1", current: 3, peak: 8, peak_at: null, updated_at: null }],
    peak_occupancy: 8,
    by_class: [],
    vehicles: { zone_entries: 0, zone_exits: 0, line_crossings: 0, unique_objects: 0 },
    persons: { zone_entries: 0, zone_exits: 0, line_crossings: 0, unique_objects: 0 },
  }) as MetricsSummary;

describe("activity from definitions", () => {
  it("builds one widget", () => {
    const defs = [def({ id: "1", metric_type: "occupancy_current", name: "תפוסה" })];
    const widgets = buildWidgetsFromDefinitions({
      definitions: defs,
      summaries: { "1": summary() },
      rangeLabel: "היום",
    });
    expect(widgets).toHaveLength(1);
    expect(widgets[0]?.value).toBe("3");
    expect(widgets[0]?.realtime).toBe(true);
  });

  it("skips disabled and groups many metrics", () => {
    const defs = [
      def({ id: "1", metric_type: "occupancy_current" }),
      def({ id: "2", metric_type: "entries", scope_type: "line", line_id: "l1", zone_id: null, direction: "a_to_b" }),
      def({ id: "3", metric_type: "dwell_avg" }),
      def({ id: "4", metric_type: "objects_observed", scope_type: "camera", zone_id: null }),
      def({ id: "5", metric_type: "exits", scope_type: "line", line_id: "l1", zone_id: null, direction: "b_to_a" }),
      def({ id: "6", metric_type: "line_crossings", scope_type: "line", line_id: "l1", zone_id: null }),
      def({ id: "7", metric_type: "occupancy_peak" }),
      def({ id: "8", metric_type: "dwell_max" }),
      def({ id: "9", metric_type: "entries", scope_type: "line", line_id: "l1", zone_id: null, enabled: false }),
      def({ id: "10", metric_type: "objects_observed", object_type: "vehicle", scope_type: "camera", zone_id: null }),
      def({ id: "11", metric_type: "entries", object_type: "car", scope_type: "line", line_id: "l1", zone_id: null }),
      def({ id: "12", metric_type: "line_crossings", object_type: "truck", scope_type: "line", line_id: "l1", zone_id: null }),
    ];
    const summaries = Object.fromEntries(defs.map((d) => [d.id, summary()]));
    const widgets = buildWidgetsFromDefinitions({ definitions: defs, summaries, rangeLabel: "היום" });
    expect(widgets.length).toBe(11);
    expect(groupWidgets(widgets).every((g) => g.items.length > 0)).toBe(true);
    expect(gridClassForCount(12)).toContain("grid-cols-3");
  });

  it("filters use object_type for vehicle group", () => {
    const f = filtersForDefinition(
      def({
        id: "v",
        metric_type: "entries",
        object_type: "vehicle",
        scope_type: "line",
        line_id: "gate",
        zone_id: null,
        direction: "a_to_b",
      }),
    );
    expect(f.object_class).toBe("vehicle");
    expect(f.line_id).toBe("gate");
    expect(f.direction).toBe("a_to_b");
  });
});
