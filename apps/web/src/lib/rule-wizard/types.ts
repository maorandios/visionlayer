/**
 * Rule Wizard domain types.
 *
 * The wizard never exposes the Rule Engine schema (trigger / zone_id / a_to_b / threshold …) to the
 * user. `RuleWizardState` is the user-facing model; `convert.ts` translates it to and from the
 * existing `Rule` schema, which remains the source of truth.
 */

/** What should happen (user-facing "object action"). Internal triggers are mapped in convert.ts. */
export type WizardActionId =
  | "detected" // זוהה במצלמה — anywhere in the field of view
  | "zone_enter" // נכנס לאזור
  | "zone_exit" // יצא מאזור
  | "zone_presence" // נמצא באזור
  | "dwell" // נשאר באזור (duration)
  | "line_cross" // חצה קו
  | "count"; // ספירת אובייקטים

/** User-facing object choices. "vehicle" is a group of classes. */
export type WizardObjectId = "person" | "vehicle" | "car" | "truck" | "motorcycle" | "bicycle" | "bus";

/** For "count": when an object is counted. */
export type CountMode = "zone" | "zone_exit" | "line";

export type WizardDirection = "any" | "a_to_b" | "b_to_a";

export type WizardMethod = "template" | "custom";

export type WizardSchedule =
  | { mode: "always" }
  | { mode: "custom"; from: string; to: string; days: number[] | null };

export type WizardOutcome = {
  /** Always true — every rule produces an event. Kept explicit for future outcomes. */
  createEvent: true;
  notify: boolean;
};

/** Parts of an existing rule the wizard cannot edit but must preserve. */
export type LegacyInfo = {
  /** Human-readable notes shown on the review step. */
  notes: string[];
  /** Raw object classes when they do not map to a wizard object (e.g. dog). */
  objectClasses: string[] | null;
  /** Count operator other than "gte". */
  countOperator: "gte" | "gt" | "lte" | "lt" | "eq" | null;
  /** zone_presence with a minimum duration (legacy semantics). */
  presenceDurationSeconds: number | null;
};

export type RuleWizardState = {
  cameraId: string | null;
  method: WizardMethod | null;
  templateId: string | null;
  action: WizardActionId | null;
  object: WizardObjectId | null;
  zoneId: string | null;
  lineId: string | null;
  direction: WizardDirection;
  /** dwell */
  durationSeconds: number;
  /** count */
  countMode: CountMode | null;
  countThresholdEnabled: boolean;
  countThreshold: number;
  countWindowSeconds: number;
  schedule: WizardSchedule;
  outcome: WizardOutcome;
  /** Empty string → a name is generated from the rule. */
  name: string;
  enabled: boolean;
  cooldownSeconds: number;
  legacy: LegacyInfo | null;
};

export type StepId =
  | "camera"
  | "method"
  | "template"
  | "action"
  | "object"
  | "count_mode"
  | "place"
  | "details"
  | "conditions"
  | "outcome"
  | "review";

/** Coarse progress groups shown to the user. */
export type StepGroup = "camera" | "kind" | "setup" | "conditions" | "outcome" | "review";

export const DEFAULT_WIZARD_STATE: RuleWizardState = {
  cameraId: null,
  method: null,
  templateId: null,
  action: null,
  object: null,
  zoneId: null,
  lineId: null,
  direction: "any",
  durationSeconds: 30,
  countMode: null,
  countThresholdEnabled: true,
  countThreshold: 5,
  countWindowSeconds: 600,
  schedule: { mode: "always" },
  outcome: { createEvent: true, notify: false },
  name: "",
  enabled: true,
  cooldownSeconds: 30,
  legacy: null,
};
