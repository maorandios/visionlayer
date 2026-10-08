/**
 * Dynamic step list + contextual validation for the Rule Wizard.
 * Universal flow: Object → What happens → Place? → When → Summary
 */
import { ACTION_BY_ID, spatialRequirement } from "@/lib/rule-wizard/config";
import type { RuleWizardState, StepGroup, StepId } from "@/lib/rule-wizard/types";

export const STEP_GROUPS: { id: StepGroup; label: string }[] = [
  { id: "camera", label: "מצלמה" },
  { id: "object", label: "אובייקט" },
  { id: "happens", label: "מה קורה" },
  { id: "place", label: "מקום" },
  { id: "when", label: "מועד" },
  { id: "review", label: "סיכום" },
];

export const STEP_GROUP_OF: Record<StepId, StepGroup> = {
  camera: "camera",
  object: "object",
  action: "happens",
  count_mode: "happens",
  place: "place",
  details: "place",
  conditions: "when",
  review: "review",
};

/** Does the "details" step have anything to ask for this state? */
export function detailsNeeded(state: RuleWizardState): boolean {
  if (!state.action) return false;
  const req = ACTION_BY_ID[state.action].requires;
  if (req.duration || req.direction) return true;
  if (state.action === "count") return true;
  if (state.legacy?.presenceDurationSeconds) return true;
  return false;
}

/**
 * Ordered steps for the current state.
 * Camera is omitted when already selected (camera-scoped / deep-link create).
 * Place is omitted when the trigger needs no spatial configuration
 * (except "detected", which offers full-frame vs zone).
 */
export function computeSteps(state: RuleWizardState): StepId[] {
  const steps: StepId[] = [];
  if (!state.cameraId) steps.push("camera");
  steps.push("object", "action");
  if (state.action === "count") steps.push("count_mode");

  const spatial = spatialRequirement(state.action, state.countMode);
  if (spatial || state.action === "detected") steps.push("place");
  if (detailsNeeded(state)) steps.push("details");
  steps.push("conditions", "review");
  return steps;
}

/** Contextual validation: returns a Hebrew message when the step is incomplete. */
export function stepError(state: RuleWizardState, step: StepId): string | null {
  switch (step) {
    case "camera":
      return state.cameraId ? null : "יש לבחור מצלמה כדי להמשיך.";
    case "object":
      return state.object || state.legacy?.objectClasses?.length ? null : "בחרו מה לזהות.";
    case "action":
      return state.action ? null : "בחרו מה צריך לקרות.";
    case "count_mode":
      return state.countMode ? null : "בחרו איפה לספור.";
    case "place": {
      if (state.action === "detected") return null; // full-frame when zoneId is null
      const need = spatialRequirement(state.action, state.countMode);
      if (need === "zone" && !state.zoneId) return "יש לבחור אזור כדי להמשיך.";
      if (need === "line" && !state.lineId) {
        return "סמנו קו, בחרו כיוון מעבר, ולחצו «שמור והמשך».";
      }
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
