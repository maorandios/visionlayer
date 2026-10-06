/**
 * Dynamic step list + contextual validation for the Rule Wizard.
 */
import { ACTION_BY_ID, TEMPLATE_BY_ID, spatialRequirement, templateDefines } from "@/lib/rule-wizard/config";
import type { RuleWizardState, StepGroup, StepId } from "@/lib/rule-wizard/types";

export const STEP_GROUPS: { id: StepGroup; label: string }[] = [
  { id: "camera", label: "מצלמה" },
  { id: "kind", label: "סוג החוק" },
  { id: "setup", label: "הגדרה" },
  { id: "conditions", label: "תנאים" },
  { id: "outcome", label: "פעולה" },
  { id: "review", label: "סיכום" },
];

export const STEP_GROUP_OF: Record<StepId, StepGroup> = {
  camera: "camera",
  method: "kind",
  template: "kind",
  action: "kind",
  object: "kind",
  count_mode: "setup",
  place: "setup",
  details: "setup",
  conditions: "conditions",
  outcome: "outcome",
  review: "review",
};

/** Does the "details" step have anything to ask for this state? */
export function detailsNeeded(state: RuleWizardState): boolean {
  if (!state.action) return false;
  const req = ACTION_BY_ID[state.action].requires;
  if (req.duration || req.direction) return true;
  if (state.action === "count") return true; // threshold question (+ direction for lines)
  if (state.legacy?.presenceDurationSeconds) return true;
  return false;
}

/**
 * Ordered steps for the current state. Irrelevant steps are omitted, e.g. a simple "detected"
 * rule never sees zone / line / details screens.
 */
export function computeSteps(state: RuleWizardState): StepId[] {
  const steps: StepId[] = ["camera", "method"];
  if (state.method === "template") {
    steps.push("template");
    const tpl = state.templateId ? TEMPLATE_BY_ID[state.templateId] : null;
    const defined = tpl ? templateDefines(tpl) : { action: false, object: false, countMode: false };
    if (!defined.action) steps.push("action");
    if (!defined.object) steps.push("object");
    if (state.action === "count" && !defined.countMode) steps.push("count_mode");
  } else if (state.method === "custom") {
    steps.push("action", "object");
    if (state.action === "count") steps.push("count_mode");
  } else {
    return steps;
  }
  if (spatialRequirement(state.action, state.countMode)) steps.push("place");
  if (detailsNeeded(state)) steps.push("details");
  steps.push("conditions", "outcome", "review");
  return steps;
}

/** Contextual validation: returns a Hebrew message when the step is incomplete. */
export function stepError(state: RuleWizardState, step: StepId): string | null {
  switch (step) {
    case "camera":
      return state.cameraId ? null : "יש לבחור מצלמה כדי להמשיך.";
    case "method":
      return state.method ? null : "בחרו איך להתחיל.";
    case "template":
      return state.templateId ? null : "בחרו תבנית כדי להמשיך.";
    case "action":
      return state.action ? null : "בחרו מה צריך לקרות.";
    case "object":
      return state.object || state.legacy?.objectClasses?.length ? null : "בחרו מה לזהות.";
    case "count_mode":
      return state.countMode ? null : "בחרו מתי לספור.";
    case "place": {
      const need = spatialRequirement(state.action, state.countMode);
      if (need === "zone" && !state.zoneId) return "יש לבחור אזור כדי להמשיך.";
      if (need === "line" && !state.lineId) return "יש לבחור קו כדי להמשיך.";
      return null;
    }
    case "details": {
      if (state.action === "dwell" && !(state.durationSeconds > 0)) return "יש להזין זמן שהייה גדול מאפס.";
      if (state.action === "count" && state.countThresholdEnabled) {
        if (!(state.countThreshold >= 1)) return "יש להזין כמות של לפחות 1.";
        if (!(state.countWindowSeconds >= 60)) return "פרק הזמן חייב להיות לפחות דקה.";
      }
      return null;
    }
    case "conditions": {
      if (state.schedule.mode === "custom") {
        const { from, to, days } = state.schedule;
        if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return "יש להזין שעות תקינות.";
        if (days !== null && days.length === 0) return "יש לבחור לפחות יום אחד.";
      }
      return null;
    }
    default:
      return null;
  }
}

/** First incomplete step (used to guard the review / save). */
export function firstIncompleteStep(state: RuleWizardState): StepId | null {
  for (const step of computeSteps(state)) {
    if (step === "review") continue;
    if (stepError(state, step)) return step;
  }
  return null;
}
