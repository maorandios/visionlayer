import { describe, expect, it } from "vitest";
import { buildRulePayload, validateRuleForm, type RuleBuilderForm } from "@/lib/rule-builder";

const sample: RuleBuilderForm = {
  name: "אדם במחסן",
  objectClass: "person",
  cameraId: "cam_01",
  zoneId: "warehouse",
  lineId: "",
  trigger: "dwell",
  direction: "any",
  scheduleFrom: "22:00",
  scheduleTo: "06:00",
  minDurationSeconds: 30,
  cooldownSeconds: 120,
  pushNotification: true,
  enabled: true,
  countThreshold: 5,
  countOperator: "gte",
  aggregationWindowSeconds: 600,
};

describe("rule builder", () => {
  it("builds API-compatible payload", () => {
    const payload = buildRulePayload(sample);
    expect(payload.conditions.object_classes).toEqual(["person"]);
    expect(payload.conditions.camera_id).toBe("cam_01");
    expect(payload.conditions.zone_id).toBe("warehouse");
    expect(payload.conditions.trigger).toBe("dwell");
    expect(payload.conditions.schedule).toEqual({ from: "22:00", to: "06:00" });
    expect(payload.conditions.min_duration_seconds).toBe(30);
    expect(payload.actions).toEqual([{ type: "push_notification" }]);
  });

  it("builds line cross payload", () => {
    const payload = buildRulePayload({
      ...sample,
      name: "חציית שער",
      trigger: "line_cross",
      zoneId: "",
      lineId: "gate_main",
      direction: "a_to_b",
      objectClass: "truck",
      minDurationSeconds: 0,
    });
    expect(payload.conditions.trigger).toBe("line_cross");
    expect(payload.conditions.line_id).toBe("gate_main");
    expect(payload.conditions.direction).toBe("a_to_b");
    expect(payload.conditions.zone_id).toBeUndefined();
  });

  it("builds count threshold payload", () => {
    const payload = buildRulePayload({
      ...sample,
      trigger: "count_threshold",
      lineId: "gate_main",
      zoneId: "",
      countThreshold: 5,
      aggregationWindowSeconds: 600,
      objectClass: "car",
    });
    expect(payload.conditions.trigger).toBe("count_threshold");
    expect(payload.conditions.threshold).toBe(5);
    expect(payload.conditions.aggregation?.window_seconds).toBe(600);
  });

  it("validates required fields", () => {
    const errors = validateRuleForm({ ...sample, name: "", zoneId: "" });
    expect(errors.length).toBeGreaterThan(0);
  });
});
