import type { Rule, RuleConditions } from "@/lib/types";

export type RuleTrigger =
  | "zone_presence"
  | "zone_enter"
  | "zone_exit"
  | "line_cross"
  | "dwell"
  | "count_threshold";

export type RuleBuilderForm = {
  name: string;
  objectClass: string;
  cameraId: string;
  zoneId: string;
  lineId: string;
  trigger: RuleTrigger;
  direction: "any" | "a_to_b" | "b_to_a";
  scheduleFrom: string;
  scheduleTo: string;
  minDurationSeconds: number;
  cooldownSeconds: number;
  pushNotification: boolean;
  enabled: boolean;
  countThreshold: number;
  countOperator: "gte" | "gt" | "lte" | "lt" | "eq";
  aggregationWindowSeconds: number;
};

export const OBJECT_CLASSES = [
  "person",
  "car",
  "truck",
  "bus",
  "bicycle",
  "motorcycle",
  "dog",
  "cat",
] as const;

export const TRIGGER_OPTIONS: { value: RuleTrigger; label: string }[] = [
  { value: "zone_enter", label: "נכנס לאזור" },
  { value: "zone_exit", label: "יוצא מאזור" },
  { value: "zone_presence", label: "נמצא באזור" },
  { value: "dwell", label: "שוהה באזור (משך)" },
  { value: "line_cross", label: "חוצה קו" },
  { value: "count_threshold", label: "סף ספירה" },
];

export const DIRECTION_OPTIONS = [
  { value: "any" as const, label: "כל כיוון" },
  { value: "a_to_b" as const, label: "כניסה (A→B)" },
  { value: "b_to_a" as const, label: "יציאה (B→A)" },
];

export const OPERATOR_OPTIONS = [
  { value: "gte" as const, label: "לפחות" },
  { value: "gt" as const, label: "יותר מ־" },
  { value: "eq" as const, label: "בדיוק" },
  { value: "lte" as const, label: "לכל היותר" },
  { value: "lt" as const, label: "פחות מ־" },
];

export function buildRulePayload(form: RuleBuilderForm) {
  const conditions: RuleConditions = {
    object_classes: [form.objectClass],
    camera_id: form.cameraId,
    trigger: form.trigger,
    schedule: { from: form.scheduleFrom, to: form.scheduleTo },
  };

  if (form.trigger === "line_cross" || (form.trigger === "count_threshold" && form.lineId)) {
    conditions.line_id = form.lineId || null;
    conditions.direction = form.direction;
  }
  if (
    form.trigger === "zone_presence" ||
    form.trigger === "zone_enter" ||
    form.trigger === "zone_exit" ||
    form.trigger === "dwell" ||
    (form.trigger === "count_threshold" && form.zoneId && !form.lineId)
  ) {
    conditions.zone_id = form.zoneId || null;
  }
  if (form.trigger === "dwell" || form.trigger === "zone_presence") {
    conditions.min_duration_seconds = form.minDurationSeconds;
  }
  if (form.trigger === "count_threshold") {
    conditions.operator = form.countOperator;
    conditions.threshold = form.countThreshold;
    conditions.count = form.countThreshold;
    conditions.aggregation_window_seconds = form.aggregationWindowSeconds || undefined;
    conditions.aggregation = {
      metric: "unique_objects",
      window_seconds: form.aggregationWindowSeconds || undefined,
      operator: form.countOperator,
      threshold: form.countThreshold,
    };
  }

  const actions = form.pushNotification
    ? [{ type: "push_notification" as const }]
    : [{ type: "create_event" as const }];
  return {
    name: form.name,
    enabled: form.enabled,
    conditions,
    actions,
    cooldown_seconds: form.cooldownSeconds,
  };
}

export function ruleToForm(rule: Rule): RuleBuilderForm {
  const c = rule.conditions;
  const trigger = (c.trigger as RuleTrigger | undefined) || inferTriggerFromConditions(c);
  return {
    name: rule.name,
    objectClass: c.object_classes?.[0] ?? "person",
    cameraId: c.camera_id ?? "",
    zoneId: c.zone_id ?? "",
    lineId: c.line_id ?? "",
    trigger,
    direction: (c.direction as RuleBuilderForm["direction"]) || "any",
    scheduleFrom: c.schedule?.from ?? "00:00",
    scheduleTo: c.schedule?.to ?? "23:59",
    minDurationSeconds: c.min_duration_seconds ?? 0,
    cooldownSeconds: rule.cooldown_seconds,
    pushNotification: rule.actions.some((a) => a.type === "push_notification"),
    enabled: rule.enabled,
    countThreshold: Number(c.threshold ?? c.count ?? 5),
    countOperator: (c.operator as RuleBuilderForm["countOperator"]) || "gte",
    aggregationWindowSeconds: Number(
      c.aggregation_window_seconds ?? c.aggregation?.window_seconds ?? 600,
    ),
  };
}

function inferTriggerFromConditions(c: RuleConditions): RuleTrigger {
  if (c.line_id) return "line_cross";
  if (c.threshold != null || c.count != null || c.aggregation_window_seconds || c.aggregation) {
    return "count_threshold";
  }
  if ((c.min_duration_seconds ?? 0) > 0) return "zone_presence";
  return "zone_presence";
}

export function validateRuleForm(form: RuleBuilderForm): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push("חובה לתת שם לחוק");
  if (!form.cameraId) errors.push("חובה לבחור מצלמה");
  if (!form.objectClass) errors.push("חובה לבחור סוג אובייקט");
  if (
    form.trigger === "zone_presence" ||
    form.trigger === "zone_enter" ||
    form.trigger === "zone_exit" ||
    form.trigger === "dwell"
  ) {
    if (!form.zoneId) errors.push("חובה לבחור אזור");
  }
  if (form.trigger === "line_cross" && !form.lineId) {
    errors.push("חובה לבחור קו");
  }
  if (form.trigger === "dwell" && form.minDurationSeconds <= 0) {
    errors.push("משך שהייה חייב להיות גדול מאפס");
  }
  if (form.trigger === "count_threshold") {
    if (!form.zoneId && !form.lineId) errors.push("חוק ספירה דורש אזור או קו");
    if (form.countThreshold < 1) errors.push("סף הספירה חייב להיות לפחות 1");
    if (form.aggregationWindowSeconds < 1) errors.push("חלון זמן חייב להיות לפחות שנייה אחת");
  }
  if (form.minDurationSeconds < 0) errors.push("משך מינימלי לא תקין");
  return errors;
}
