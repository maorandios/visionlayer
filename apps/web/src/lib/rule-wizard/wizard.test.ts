import { describe, expect, it } from "vitest";
import { describeRule, ruleSentence } from "@/lib/rule-describe";
import {
  ACTIONS,
  OBJECTS,
  TEMPLATES,
  TEMPLATE_BY_ID,
  availableObjects,
  isCombinationSupported,
  objectForClasses,
  spatialRequirement,
} from "@/lib/rule-wizard/config";
import {
  FULL_FRAME_PLACEHOLDER_ID,
  FULL_FRAME_POINTS,
  applyTemplate,
  isFullFramePoints,
  previewRule,
  ruleToWizard,
  suggestRuleName,
  wizardToRule,
} from "@/lib/rule-wizard/convert";
import { computeSteps, firstIncompleteStep, stepError } from "@/lib/rule-wizard/steps";
import { DEFAULT_WIZARD_STATE, type RuleWizardState } from "@/lib/rule-wizard/types";
import type { Rule, Zone } from "@/lib/types";

const names = {
  cameraName: (id: string | null | undefined) => (id === "cam_1" ? "שער ראשי" : "—"),
  zoneName: (id: string | null | undefined) => (id === "z_store" ? "מחסן" : id === "z_full" ? "כל שדה הראייה" : "—"),
  lineName: (id: string | null | undefined) => (id === "l_gate" ? "שער כניסה" : "—"),
  isFullFrameZone: (id: string | null | undefined) => id === "z_full",
  directionLabel: (lineId: string | null | undefined, dir: string | null | undefined) =>
    dir === "a_to_b" ? "כניסה" : dir === "b_to_a" ? "יציאה" : null,
};

const fullFrameZone: Zone = {
  id: "z_full",
  camera_id: "cam_1",
  name: "כל שדה הראייה",
  kind: "polygon",
  points: FULL_FRAME_POINTS,
  enabled: true,
  created_at: "",
};

function asRule(payload: ReturnType<typeof wizardToRule>, id = "r1"): Rule {
  return { id, ...payload, last_triggered_at: null, created_at: "", updated_at: "" };
}

function state(partial: Partial<RuleWizardState>): RuleWizardState {
  return { ...DEFAULT_WIZARD_STATE, cameraId: "cam_1", method: "custom", ...partial };
}

// ---------------------------------------------------------------------------

describe("config", () => {
  it("has the seven user-facing actions and seven object choices without technical names", () => {
    expect(ACTIONS.map((a) => a.label)).toEqual([
      "זוהה במצלמה",
      "נכנס לאזור",
      "יצא מאזור",
      "נמצא באזור",
      "נשאר באזור",
      "חצה קו",
      "ספירת אובייקטים",
    ]);
    expect(OBJECTS.map((o) => o.label)).toEqual(["אדם", "רכב", "מכונית", "משאית", "אופנוע", "אופניים", "אוטובוס"]);
    for (const a of ACTIONS) {
      for (const token of ["zone_presence", "line_cross", "count_threshold", "a_to_b"]) {
        expect(`${a.label} ${a.description}`).not.toContain(token);
      }
    }
  });

  it("maps the vehicle group to the four vehicle classes and back", () => {
    expect(objectForClasses(["car", "truck", "bus", "motorcycle"])).toBe("vehicle");
    expect(objectForClasses(["motorcycle", "car", "bus", "truck"])).toBe("vehicle");
    expect(objectForClasses(["truck"])).toBe("truck");
    expect(objectForClasses(["dog"])).toBeNull();
  });

  it("only offers supported combinations", () => {
    expect(isCombinationSupported("line_cross", "truck")).toBe(true);
    expect(availableObjects("count").map((o) => o.id)).toContain("vehicle");
  });

  it("templates are only preconfigured wizard state and cover the required scenarios", () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const required of [
      "person_enter",
      "person_forbidden",
      "person_dwell",
      "person_after_hours",
      "vehicle_enter",
      "vehicle_exit",
      "truck_enter",
      "vehicle_cross_gate",
      "vehicle_count",
      "people_count",
      "truck_count",
      "zone_occupancy",
    ]) {
      expect(ids).toContain(required);
    }
    for (const tpl of TEMPLATES) {
      expect(tpl.preset.action).toBeTruthy();
      expect(tpl.preset.object).toBeTruthy();
      expect(tpl.preset.zoneId).toBeUndefined();
      expect(tpl.preset.lineId).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------

describe("computeSteps", () => {
  it("skips irrelevant steps for a simple 'detected' rule", () => {
    const s = state({ action: "detected", object: "vehicle" });
    expect(computeSteps(s)).toEqual(["camera", "method", "action", "object", "conditions", "outcome", "review"]);
  });

  it("asks only what the template did not define", () => {
    const s = applyTemplate(state({ method: "template" }), "truck_enter");
    expect(computeSteps(s)).toEqual(["camera", "method", "template", "place", "details", "conditions", "outcome", "review"]);
  });

  it("includes count mode and place for custom count rules", () => {
    const s = state({ action: "count", object: "truck", countMode: "line" });
    expect(computeSteps(s)).toEqual([
      "camera",
      "method",
      "action",
      "object",
      "count_mode",
      "place",
      "details",
      "conditions",
      "outcome",
      "review",
    ]);
    expect(spatialRequirement("count", "zone")).toBe("zone");
    expect(spatialRequirement("count", "zone_exit")).toBe("zone");
    expect(spatialRequirement("count", "line")).toBe("line");
  });

  it("gives contextual Hebrew validation messages", () => {
    expect(stepError(state({ cameraId: null }), "camera")).toBe("יש לבחור מצלמה כדי להמשיך.");
    expect(stepError(state({ action: "zone_enter" }), "place")).toBe("יש לבחור אזור כדי להמשיך.");
    expect(stepError(state({ action: "line_cross" }), "place")).toBe("יש לבחור קו כדי להמשיך.");
    expect(stepError(state({ action: "dwell", durationSeconds: 0 }), "details")).toBe("יש להזין זמן שהייה גדול מאפס.");
    expect(stepError(state({ action: "count", countThreshold: 0 }), "details")).toBe("יש להזין כמות של לפחות 1.");
    expect(stepError(state({ schedule: { mode: "custom", from: "08:00", to: "18:00", days: [] } }), "conditions")).toBe(
      "יש לבחור לפחות יום אחד.",
    );
    expect(firstIncompleteStep(state({ action: "zone_enter", object: "person", zoneId: "z_store" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("wizardToRule — required flows", () => {
  it("template: משאית נכנסת → line → direction → valid schema", () => {
    let s = applyTemplate(state({ method: "template" }), "truck_enter");
    expect(s.action).toBe("line_cross");
    expect(s.object).toBe("truck");
    s = { ...s, lineId: "l_gate", direction: "a_to_b" };
    expect(firstIncompleteStep(s)).toBeNull();
    const payload = wizardToRule(s, { name: suggestRuleName(s, names) });
    expect(payload).toEqual({
      name: "משאית חוצה שער כניסה — כניסה",
      enabled: true,
      cooldown_seconds: 30,
      actions: [{ type: "create_event" }],
      conditions: {
        object_classes: ["truck"],
        camera_id: "cam_1",
        trigger: "line_cross",
        line_id: "l_gate",
        direction: "a_to_b",
      },
    });
  });

  it("custom: אדם נכנס למחסן", () => {
    const s = state({ action: "zone_enter", object: "person", zoneId: "z_store" });
    const p = wizardToRule(s, { name: suggestRuleName(s, names) });
    expect(p.name).toBe("אדם נכנס למחסן");
    expect(p.conditions).toEqual({ object_classes: ["person"], camera_id: "cam_1", trigger: "zone_enter", zone_id: "z_store" });
    expect(describeRule(asRule(p), names).when).toBe('אדם נכנס ל"מחסן"');
  });

  it("dwell 30 seconds → min_duration_seconds", () => {
    const s = state({ action: "dwell", object: "person", zoneId: "z_store", durationSeconds: 30 });
    const p = wizardToRule(s, { name: suggestRuleName(s, names) });
    expect(p.name).toBe("אדם נשאר במחסן 30 שניות");
    expect(p.conditions.trigger).toBe("dwell");
    expect(p.conditions.min_duration_seconds).toBe(30);
    expect(describeRule(asRule(p), names).when).toBe('אדם שוהה ב"מחסן" יותר מ־30 שניות');
  });

  it("line crossing with vehicle group and named direction", () => {
    const s = state({ action: "line_cross", object: "vehicle", lineId: "l_gate", direction: "b_to_a" });
    const p = wizardToRule(s);
    expect(p.conditions.object_classes).toEqual(["car", "truck", "bus", "motorcycle"]);
    expect(p.conditions.direction).toBe("b_to_a");
    expect(describeRule(asRule(p), names).when).toBe('רכב חוצה את "שער כניסה" בכיוון יציאה');
  });

  it("count: at least 5 trucks leaving a zone within 10 minutes", () => {
    const s = state({
      action: "count",
      object: "truck",
      countMode: "zone_exit",
      zoneId: "z_store",
      countThresholdEnabled: true,
      countThreshold: 5,
      countWindowSeconds: 600,
    });
    const p = wizardToRule(s);
    expect(p.conditions).toMatchObject({
      trigger: "count_threshold",
      zone_id: "z_store",
      aggregation: expect.objectContaining({ count_on: "zone_exit", threshold: 5 }),
    });
    expect(describeRule(asRule(p), names).when).toBe('לפחות 5 משאיות יוצאות מ"מחסן" בתוך 10 דקות');
    expect(ruleToWizard(asRule(p)).countMode).toBe("zone_exit");
  });

  it("count: at least 5 trucks crossing a line within 10 minutes", () => {
    const s = state({
      action: "count",
      object: "truck",
      countMode: "line",
      lineId: "l_gate",
      countThresholdEnabled: true,
      countThreshold: 5,
      countWindowSeconds: 600,
    });
    const p = wizardToRule(s, { name: suggestRuleName(s, names) });
    expect(p.name).toBe("ספירת משאיות — שער כניסה");
    expect(p.conditions).toMatchObject({
      trigger: "count_threshold",
      line_id: "l_gate",
      operator: "gte",
      threshold: 5,
      count: 5,
      aggregation_window_seconds: 600,
    });
    expect(describeRule(asRule(p), names).when).toBe('לפחות 5 משאיות חוצות את "שער כניסה" בתוך 10 דקות');
  });

  it("count without a threshold falls back to the underlying trigger", () => {
    const s = state({ action: "count", object: "vehicle", countMode: "zone", zoneId: "z_store", countThresholdEnabled: false });
    expect(wizardToRule(s).conditions.trigger).toBe("zone_enter");
    const l = state({ action: "count", object: "vehicle", countMode: "line", lineId: "l_gate", countThresholdEnabled: false });
    expect(wizardToRule(l).conditions.trigger).toBe("line_cross");
    expect(wizardToRule(l).conditions.threshold).toBeUndefined();
  });

  it("'detected' uses the full-frame zone with zero presence time", () => {
    const s = state({ action: "detected", object: "vehicle", zoneId: "z_full" });
    const p = wizardToRule(s, { name: suggestRuleName(s, names) });
    expect(p.name).toBe("רכב זוהה במצלמה");
    expect(p.conditions).toMatchObject({ trigger: "zone_presence", zone_id: "z_full", min_duration_seconds: 0 });
    expect(describeRule(asRule(p), names).when).toBe("רכב זוהה במצלמה");
    expect(isFullFramePoints(FULL_FRAME_POINTS)).toBe(true);
    expect(isFullFramePoints([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])).toBe(false);
  });

  it("schedule: always → omitted; custom hours + days → schedule block; midnight crossing allowed", () => {
    expect(wizardToRule(state({ action: "detected", object: "person", zoneId: "z_full" })).conditions.schedule).toBeUndefined();
    const s = state({
      action: "detected",
      object: "person",
      zoneId: "z_full",
      schedule: { mode: "custom", from: "22:00", to: "06:00", days: [6, 0, 1, 2, 3] },
    });
    expect(wizardToRule(s).conditions.schedule).toEqual({ from: "22:00", to: "06:00", days: [6, 0, 1, 2, 3] });
    const tpl = applyTemplate(state({ method: "template" }), "person_after_hours");
    expect(wizardToRule({ ...tpl, zoneId: "z_full" }).conditions.schedule).toEqual({ from: "22:00", to: "06:00" });
  });

  it("outcome: create_event always, push only when notify is on", () => {
    const s = state({ action: "zone_enter", object: "person", zoneId: "z_store" });
    expect(wizardToRule(s).actions).toEqual([{ type: "create_event" }]);
    expect(wizardToRule({ ...s, outcome: { createEvent: true, notify: true } }).actions).toEqual([
      { type: "create_event" },
      { type: "push_notification" },
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("ruleToWizard — editing round-trip", () => {
  const cases: Partial<RuleWizardState>[] = [
    { action: "zone_enter", object: "person", zoneId: "z_store" },
    { action: "zone_exit", object: "vehicle", zoneId: "z_store" },
    { action: "zone_presence", object: "person", zoneId: "z_store" },
    { action: "dwell", object: "person", zoneId: "z_store", durationSeconds: 45 },
    { action: "line_cross", object: "truck", lineId: "l_gate", direction: "a_to_b" },
    { action: "detected", object: "car", zoneId: "z_full" },
    {
      action: "count",
      object: "truck",
      countMode: "line",
      lineId: "l_gate",
      direction: "any",
      countThreshold: 7,
      countWindowSeconds: 300,
    },
    {
      action: "count",
      object: "truck",
      countMode: "zone_exit",
      zoneId: "z_store",
      countThreshold: 5,
      countWindowSeconds: 600,
    },
    {
      action: "count",
      object: "person",
      countMode: "zone",
      zoneId: "z_store",
      countThreshold: 10,
      countWindowSeconds: 600,
    },
    {
      action: "zone_enter",
      object: "person",
      zoneId: "z_store",
      schedule: { mode: "custom", from: "22:00", to: "06:00", days: [4, 5] },
      outcome: { createEvent: true, notify: true },
      enabled: false,
      cooldownSeconds: 120,
    },
  ];

  for (const partial of cases) {
    it(`round-trips ${partial.action}${partial.countMode ? `/${partial.countMode}` : ""}`, () => {
      const original = state({ ...partial, name: "חוק לבדיקה" });
      const payload = wizardToRule(original);
      const back = ruleToWizard(asRule(payload), { zones: [fullFrameZone] });
      const again = wizardToRule(back);
      expect(again).toEqual(payload);
      expect(back.action).toBe(original.action);
      expect(back.object).toBe(original.object);
      expect(back.legacy).toBeNull();
      expect(back.name).toBe("חוק לבדיקה");
    });
  }

  it("preserves settings the wizard cannot express and explains them", () => {
    const legacyRule: Rule = {
      id: "r_legacy",
      name: "ישן",
      enabled: true,
      cooldown_seconds: 0,
      actions: [{ type: "create_event" }],
      conditions: {
        object_classes: ["dog"],
        camera_id: "cam_1",
        zone_id: "z_store",
        trigger: "zone_presence",
        min_duration_seconds: 12,
      },
      last_triggered_at: null,
      created_at: "",
      updated_at: "",
    };
    const w = ruleToWizard(legacyRule, { zones: [] });
    expect(w.action).toBe("zone_presence");
    expect(w.object).toBeNull();
    expect(w.legacy?.objectClasses).toEqual(["dog"]);
    expect(w.legacy?.presenceDurationSeconds).toBe(12);
    expect(w.legacy?.notes.length).toBe(2);
    const p = wizardToRule(w);
    expect(p.conditions.object_classes).toEqual(["dog"]);
    expect(p.conditions.min_duration_seconds).toBe(12);
  });

  it("keeps a non-default count operator", () => {
    const r = asRule(
      wizardToRule(state({ action: "count", object: "person", countMode: "zone", zoneId: "z_store", countThreshold: 3 })),
    );
    r.conditions.operator = "gt";
    r.conditions.aggregation = { ...r.conditions.aggregation, operator: "gt" };
    const w = ruleToWizard(r);
    expect(w.legacy?.countOperator).toBe("gt");
    expect(wizardToRule(w).conditions.operator).toBe("gt");
  });

  it("infers legacy rules without an explicit trigger", () => {
    const r = asRule(wizardToRule(state({ action: "line_cross", object: "car", lineId: "l_gate" })));
    delete r.conditions.trigger;
    expect(ruleToWizard(r).action).toBe("line_cross");
  });
});

// ---------------------------------------------------------------------------

describe("preview", () => {
  it("is null before the rule has an action and object", () => {
    expect(previewRule(state({}))).toBeNull();
    expect(previewRule(state({ action: "zone_enter" }))).toBeNull();
  });

  it("'detected' previews as 'זוהה במצלמה' before the full-frame zone exists", () => {
    const r = previewRule(state({ action: "detected", object: "vehicle" })) as Rule;
    expect(r.conditions.zone_id).toBe(FULL_FRAME_PLACEHOLDER_ID);
    const d = describeRule(r, { ...names, isFullFrameZone: (id) => id === FULL_FRAME_PLACEHOLDER_ID });
    expect(d.when).toBe("רכב זוהה במצלמה");
  });

  it("uses the shared description utility and reads as one sentence", () => {
    const s = state({ action: "line_cross", object: "truck", lineId: "l_gate", direction: "a_to_b" });
    const r = previewRule(s);
    expect(r).not.toBeNull();
    expect(ruleSentence(r as Rule, names)).toBe('כאשר משאית חוצה את "שער כניסה" בכיוון כניסה במצלמת "שער ראשי" — צור אירוע.');
  });

  it("template titles map to the preview without extra questions", () => {
    const tpl = TEMPLATE_BY_ID.vehicle_count;
    const s = { ...applyTemplate(state({ method: "template" }), tpl.id), lineId: "l_gate" };
    expect(describeRule(previewRule(s) as Rule, names).when).toBe('לפחות 5 רכבים חוצים את "שער כניסה" בתוך 10 דקות');
  });
});
