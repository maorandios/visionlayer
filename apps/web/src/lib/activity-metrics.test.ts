import { describe, expect, it } from "vitest";
import {
  buildActivityWidgets,
  defaultPrefsForCamera,
  gridClassForCount,
  groupWidgets,
  type StoredMetricPref,
} from "@/lib/activity-metrics";
import type { MetricsSummary } from "@/lib/types";

const summary = (over: Partial<MetricsSummary> = {}): MetricsSummary =>
  ({
    scope: "production",
    analysis_run_id: null,
    from: null,
    to: null,
    totals: {
      zone_entries: 10,
      zone_exits: 4,
      line_crossings: 7,
      unique_objects: 3,
      events_total: 0,
    },
    dwell: { sessions: 2, total_seconds: 120, avg_seconds: 60, max_seconds: 90 },
    occupancy: [{ camera_id: "c1", zone_id: "z1", current: 5, peak: 9, peak_at: null, updated_at: null }],
    peak_occupancy: 9,
    by_class: [{ object_class: "car", zone_entries: 3, zone_exits: 0, line_crossings: 1, unique_objects: 2 }],
    vehicles: { zone_entries: 3, zone_exits: 0, line_crossings: 1, unique_objects: 2 },
    persons: { zone_entries: 6, zone_exits: 2, line_crossings: 0, unique_objects: 1 },
    ...over,
  }) as MetricsSummary;

describe("activity metrics presentation", () => {
  it("defaults seed when zones/lines exist", () => {
    expect(defaultPrefsForCamera({ hasZones: false, hasLines: false })).toEqual([]);
    expect(defaultPrefsForCamera({ hasZones: true, hasLines: false }).length).toBeGreaterThan(0);
    expect(defaultPrefsForCamera({ hasZones: true, hasLines: true }).some((p) => p.kind === "line_crossings")).toBe(
      true,
    );
  });

  it("builds widgets for one and many prefs", () => {
    const one: StoredMetricPref[] = [{ id: "a", kind: "zone_entries" }];
    const many: StoredMetricPref[] = [
      { id: "1", kind: "occupancy_current" },
      { id: "2", kind: "zone_entries" },
      { id: "3", kind: "line_crossings" },
      { id: "4", kind: "dwell_avg" },
      { id: "5", kind: "persons_entries" },
      { id: "6", kind: "vehicles_entries" },
      { id: "7", kind: "unique_objects" },
      { id: "8", kind: "dwell_sessions" },
      { id: "9", kind: "occupancy_peak" },
      { id: "10", kind: "dwell_max" },
      { id: "11", kind: "zone_exits" },
      { id: "12", kind: "class_entries", objectClass: "car", label: "מכוניות" },
    ];
    expect(buildActivityWidgets({ prefs: one, summary: summary(), zoneName: () => "ז", rangeLabel: "היום" })).toHaveLength(
      1,
    );
    const twelve = buildActivityWidgets({
      prefs: many,
      summary: summary(),
      zoneName: () => "ז",
      rangeLabel: "היום",
    });
    expect(twelve.length).toBe(12);
    expect(groupWidgets(twelve).every((g) => g.items.length > 0)).toBe(true);
  });

  it("grid densifies with more widgets", () => {
    expect(gridClassForCount(1)).toContain("grid-cols-1");
    expect(gridClassForCount(4)).toContain("grid-cols-2");
    expect(gridClassForCount(12)).toContain("grid-cols-3");
  });
});
