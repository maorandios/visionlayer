import { describe, expect, it } from "vitest";
import { describeRule, ruleSentence, triggerKind } from "@/lib/rule-describe";
import type { Rule } from "@/lib/types";

const names = {
  cameraName: (id: string | null | undefined) => (id === "cam_1" ? "חניון ראשי" : "—"),
  zoneName: (id: string | null | undefined) => (id === "z_1" ? "המחסן" : "—"),
  lineName: (id: string | null | undefined) => (id === "l_1" ? "שער A" : "—"),
};

function rule(partial: Partial<Rule["conditions"]>, extra: Partial<Rule> = {}): Rule {
  return {
    id: "r1",
    name: "חוק",
    enabled: true,
    conditions: { object_classes: ["car", "truck", "bus", "motorcycle"], camera_id: "cam_1", ...partial },
    actions: [{ type: "push_notification" }],
    cooldown_seconds: 0,
    last_triggered_at: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

describe("describeRule", () => {
  it("line crossing reads like a sentence with direction", () => {
    const d = describeRule(rule({ trigger: "line_cross", line_id: "l_1", direction: "a_to_b" }), names);
    expect(d.when).toBe('רכב חוצה את "שער A" בכיוון כניסה');
    expect(d.where).toBe("חניון ראשי");
    expect(d.action).toBe("שליחת התראה ויצירת אירוע");
    expect(d.triggerKind).toBe("line");
    expect(d.schedule).toBeNull();
  });

  it("zone enter / exit / presence", () => {
    expect(describeRule(rule({ trigger: "zone_enter", zone_id: "z_1", object_classes: ["person"] }), names).when).toBe(
      'אדם נכנס ל"המחסן"',
    );
    expect(describeRule(rule({ trigger: "zone_exit", zone_id: "z_1" }), names).when).toBe('רכב יוצא מ"המחסן"');
    expect(
      describeRule(rule({ trigger: "zone_presence", zone_id: "z_1", min_duration_seconds: 0 }), names).when,
    ).toBe('רכב נמצא ב"המחסן"');
  });

  it("dwell includes the duration", () => {
    const d = describeRule(
      rule({ trigger: "dwell", zone_id: "z_1", min_duration_seconds: 30, object_classes: ["person"] }),
      names,
    );
    expect(d.when).toBe('אדם שוהה ב"המחסן" יותר מ־30 שניות');
    expect(d.triggerKind).toBe("dwell");
  });

  it("count threshold reads naturally with window", () => {
    const d = describeRule(
      rule({
        trigger: "count_threshold",
        line_id: "l_1",
        operator: "gte",
        threshold: 5,
        aggregation_window_seconds: 600,
      }),
      names,
    );
    expect(d.when).toBe('לפחות 5 רכבים חוצים את "שער A" בתוך 10 דקות');
    expect(d.triggerKind).toBe("count");
  });

  it("schedule shown only when it is not all-day; action without push is just an event", () => {
    const d = describeRule(
      rule({ trigger: "zone_enter", zone_id: "z_1", schedule: { from: "08:00", to: "18:00" } }, { actions: [{ type: "create_event" }] }),
      names,
    );
    expect(d.schedule).toBe("08:00–18:00");
    expect(d.action).toBe("יצירת אירוע");
    expect(describeRule(rule({ schedule: { from: "00:00", to: "23:59" } }), names).schedule).toBeNull();
  });

  it("triggerKind infers from legacy conditions", () => {
    expect(triggerKind(rule({ line_id: "l_1" }))).toBe("line");
    expect(triggerKind(rule({ threshold: 3 }))).toBe("count");
    expect(triggerKind(rule({ zone_id: "z_1" }))).toBe("zone");
  });

  it("single classes use their own label with gender agreement; the vehicle group reads as רכב", () => {
    expect(describeRule(rule({ trigger: "zone_enter", zone_id: "z_1", object_classes: ["car"] }), names).when).toBe(
      'מכונית נכנסת ל"המחסן"',
    );
    expect(describeRule(rule({ trigger: "zone_exit", zone_id: "z_1", object_classes: ["truck"] }), names).when).toBe(
      'משאית יוצאת מ"המחסן"',
    );
    expect(
      describeRule(rule({ trigger: "count_threshold", line_id: "l_1", threshold: 3, object_classes: ["truck"] }), names).when,
    ).toBe('לפחות 3 משאיות חוצות את "שער A"');
    expect(
      describeRule(rule({ trigger: "zone_presence", zone_id: "z_full", min_duration_seconds: 0, object_classes: ["truck"] }), {
        ...names,
        isFullFrameZone: (id) => id === "z_full",
      }).when,
    ).toBe("משאית זוהתה במצלמה");
  });

  it("full-frame zone reads as 'זוהה במצלמה'", () => {
    const d = describeRule(
      rule({ trigger: "zone_presence", zone_id: "z_full", min_duration_seconds: 0, object_classes: ["person"] }),
      { ...names, isFullFrameZone: (id) => id === "z_full" },
    );
    expect(d.when).toBe("אדם זוהה במצלמה");
    expect(d.triggerKind).toBe("zone");
  });

  it("uses the line's own direction names when provided", () => {
    const d = describeRule(rule({ trigger: "line_cross", line_id: "l_1", direction: "b_to_a", object_classes: ["truck"] }), {
      ...names,
      directionLabel: (lineId, dir) => (lineId === "l_1" && dir === "b_to_a" ? "אל המחסן" : null),
    });
    expect(d.when).toBe('משאית חוצה את "שער A" בכיוון אל המחסן');
  });

  it("ruleSentence is one readable line with camera and outcome", () => {
    const s = ruleSentence(
      rule({ trigger: "line_cross", line_id: "l_1", direction: "a_to_b", object_classes: ["truck"] }, { actions: [{ type: "create_event" }] }),
      names,
    );
    expect(s).toBe('כאשר משאית חוצה את "שער A" בכיוון כניסה במצלמת "חניון ראשי" — צור אירוע.');
  });

  it("'detected' sentence folds the camera into the verb", () => {
    const s = ruleSentence(
      rule({ trigger: "zone_presence", zone_id: "z_full", min_duration_seconds: 0, object_classes: ["person"] }, { actions: [{ type: "create_event" }] }),
      { ...names, isFullFrameZone: (id) => id === "z_full" },
    );
    expect(s).toBe('כאשר אדם זוהה במצלמת "חניון ראשי" — צור אירוע.');
  });

  it("schedule with days reads naturally", () => {
    expect(describeRule(rule({ schedule: { from: "22:00", to: "06:00", days: [6, 0, 1, 2, 3] } }), names).schedule).toBe(
      "ראשון–חמישי 22:00–06:00",
    );
    expect(describeRule(rule({ schedule: { from: "00:00", to: "23:59", days: [4, 5] } }), names).schedule).toBe("שישי, שבת");
  });

  it("never leaks internal schema terms", () => {
    const d = describeRule(rule({ trigger: "line_cross", line_id: "l_1", direction: "b_to_a" }), names);
    for (const token of ["line_cross", "b_to_a", "zone_id", "object_classes"]) {
      expect(`${d.when} ${d.where} ${d.action}`).not.toContain(token);
    }
  });
});
