import { describe, expect, it } from "vitest";
import {
  METRIC_TYPES,
  OBJECT_TYPES,
  OBJECT_TYPE_LABELS,
  VEHICLE_CLASSES,
  resolveObjectClasses,
} from "@/lib/vision-capabilities";
import { canAdvance, metricWizardErrors } from "@/lib/metric-wizard/validate";
import { applyMetricTypeDefaults, computeMetricSteps } from "@/lib/metric-wizard/steps";
import { suggestMetricName } from "@/lib/metric-wizard/name";
import { DEFAULT_METRIC_WIZARD } from "@/lib/metric-wizard/types";

describe("vision capabilities", () => {
  it("exposes only supported object types", () => {
    expect([...OBJECT_TYPES]).toEqual([
      "person",
      "vehicle",
      "car",
      "truck",
      "bus",
      "motorcycle",
      "bicycle",
    ]);
    expect(OBJECT_TYPES).not.toContain("dog");
    expect(OBJECT_TYPES).not.toContain("child");
    for (const id of OBJECT_TYPES) {
      expect(OBJECT_TYPE_LABELS[id]).toBeTruthy();
    }
  });

  it("maps vehicle group to detector classes without bicycle", () => {
    expect(resolveObjectClasses("vehicle")).toEqual([...VEHICLE_CLASSES]);
    expect(VEHICLE_CLASSES).not.toContain("bicycle");
  });

  it("lists the eight V1 metric types", () => {
    expect(METRIC_TYPES.map((m) => m.id)).toEqual([
      "entries",
      "exits",
      "line_crossings",
      "occupancy_current",
      "occupancy_peak",
      "dwell_avg",
      "dwell_max",
      "objects_observed",
    ]);
  });
});

describe("metric wizard steps", () => {
  it("skips settings for occupancy", () => {
    const state = applyMetricTypeDefaults("occupancy_current", DEFAULT_METRIC_WIZARD);
    expect(computeMetricSteps(state)).toEqual(["type", "object", "place", "summary"]);
  });

  it("folds direction into place for line metrics (no settings step)", () => {
    const state = applyMetricTypeDefaults("entries", DEFAULT_METRIC_WIZARD);
    expect(computeMetricSteps(state)).toEqual(["type", "object", "place", "summary"]);
    expect(computeMetricSteps(state)).not.toContain("settings");
    expect(state.direction).toBeNull();
  });

  it("defaults crossing direction to both (any)", () => {
    const state = applyMetricTypeDefaults("line_crossings", DEFAULT_METRIC_WIZARD);
    expect(state.direction).toBe("any");
  });
});

describe("metric wizard validation", () => {
  it("requires line and direction for entries", () => {
    const state = {
      ...applyMetricTypeDefaults("entries", DEFAULT_METRIC_WIZARD),
      objectType: "person" as const,
      name: "כניסות",
    };
    expect(metricWizardErrors(state).some((e) => e.includes("קו"))).toBe(true);
    expect(canAdvance("place", state)).toBe(false);
    const withLine = { ...state, lineId: "gate" };
    expect(canAdvance("place", withLine)).toBe(false);
    const ok = { ...withLine, direction: "a_to_b" as const };
    expect(canAdvance("place", ok)).toBe(true);
    expect(metricWizardErrors(ok)).toEqual([]);
  });

  it("allows crossing with both directions (any)", () => {
    const state = {
      ...applyMetricTypeDefaults("line_crossings", DEFAULT_METRIC_WIZARD),
      objectType: "vehicle" as const,
      name: "חציות",
      lineId: "gate",
      direction: "any" as const,
    };
    expect(canAdvance("place", state)).toBe(true);
    expect(metricWizardErrors(state)).toEqual([]);
  });

  it("requires zone for occupancy", () => {
    const state = {
      ...applyMetricTypeDefaults("occupancy_current", DEFAULT_METRIC_WIZARD),
      objectType: "person" as const,
      name: "תפוסה",
    };
    expect(metricWizardErrors(state).some((e) => e.includes("אזור"))).toBe(true);
  });

  it("allows camera scope for objects_observed", () => {
    const state = {
      ...applyMetricTypeDefaults("objects_observed", DEFAULT_METRIC_WIZARD),
      objectType: "car" as const,
      name: "רכבים שנצפו",
      scopeType: "camera" as const,
    };
    expect(metricWizardErrors(state)).toEqual([]);
  });
});

describe("metric name suggestions", () => {
  it("builds hebrew names", () => {
    expect(suggestMetricName({ metricType: "entries", objectType: "vehicle" })).toContain("כניסות");
    expect(
      suggestMetricName({ metricType: "dwell_avg", objectType: "person", placeName: "מחסן" }),
    ).toContain("מחסן");
  });
});
