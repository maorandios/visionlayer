import { describe, expect, it } from "vitest";
import { buildRulePayload, validateRuleForm, type RuleBuilderForm } from "@/lib/rule-builder";

const sample: RuleBuilderForm = {
  name: "אדם במחסן",
  objectClass: "person",
  cameraId: "cam_01",
  zoneId: "warehouse",
  scheduleFrom: "22:00",
  scheduleTo: "06:00",
  minDurationSeconds: 30,
  cooldownSeconds: 120,
  pushNotification: true,
  enabled: true,
};

describe("rule builder", () => {
  it("builds API-compatible payload", () => {
    const payload = buildRulePayload(sample);
    expect(payload.conditions.object_classes).toEqual(["person"]);
    expect(payload.conditions.camera_id).toBe("cam_01");
    expect(payload.conditions.zone_id).toBe("warehouse");
    expect(payload.conditions.schedule).toEqual({ from: "22:00", to: "06:00" });
    expect(payload.conditions.min_duration_seconds).toBe(30);
    expect(payload.actions).toEqual([{ type: "push_notification" }]);
  });

  it("validates required fields", () => {
    const errors = validateRuleForm({ ...sample, name: "", zoneId: "" });
    expect(errors.length).toBeGreaterThan(0);
  });
});
