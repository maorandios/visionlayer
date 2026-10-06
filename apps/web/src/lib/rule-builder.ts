import type { Rule, RuleConditions } from "@/lib/types";

export type RuleBuilderForm = {
  name: string;
  objectClass: string;
  cameraId: string;
  zoneId: string;
  scheduleFrom: string;
  scheduleTo: string;
  minDurationSeconds: number;
  cooldownSeconds: number;
  pushNotification: boolean;
  enabled: boolean;
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

export function buildRulePayload(form: RuleBuilderForm) {
  const conditions: RuleConditions = {
    object_classes: [form.objectClass],
    camera_id: form.cameraId,
    zone_id: form.zoneId,
    min_duration_seconds: form.minDurationSeconds,
    schedule: { from: form.scheduleFrom, to: form.scheduleTo },
  };
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
  return {
    name: rule.name,
    objectClass: c.object_classes?.[0] ?? "person",
    cameraId: c.camera_id ?? "",
    zoneId: c.zone_id ?? "",
    scheduleFrom: c.schedule?.from ?? "00:00",
    scheduleTo: c.schedule?.to ?? "23:59",
    minDurationSeconds: c.min_duration_seconds ?? 0,
    cooldownSeconds: rule.cooldown_seconds,
    pushNotification: rule.actions.some((a) => a.type === "push_notification"),
    enabled: rule.enabled,
  };
}

export function validateRuleForm(form: RuleBuilderForm): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push("חובה לתת שם לחוק");
  if (!form.cameraId) errors.push("חובה לבחור מצלמה");
  if (!form.zoneId) errors.push("חובה לבחור אזור");
  if (!form.objectClass) errors.push("חובה לבחור סוג אובייקט");
  if (form.minDurationSeconds < 0) errors.push("משך מינימלי לא תקין");
  return errors;
}
