/**
 * Central configuration for the Rule Wizard: actions, objects, capability mapping.
 * All conditional behaviour of the wizard derives from this file.
 * Object availability is driven by the shared VisionCapabilities registry.
 */
import type { CountMode, WizardActionId, WizardObjectId } from "@/lib/rule-wizard/types";
import {
  OBJECT_TYPES,
  OBJECT_TYPE_LABELS,
  OBJECT_TYPE_TO_CLASSES,
  VEHICLE_CLASSES as VEHICLE_CLASSES_SSOT,
  type VisionObjectType,
} from "@/lib/vision-capabilities";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionRequirements = {
  zone?: boolean;
  line?: boolean;
  duration?: boolean;
  /** direction is asked (optional, defaults to any) */
  direction?: boolean;
  /** count flow: asks what to count and where */
  countMode?: boolean;
};

export type ActionDef = {
  id: WizardActionId;
  label: string;
  description: string;
  /** lucide icon name, resolved by the UI */
  icon: "ScanEye" | "LogIn" | "LogOut" | "MapPin" | "Timer" | "ArrowLeftRight" | "Hash";
  requires: ActionRequirements;
};

export const ACTIONS: ActionDef[] = [
  {
    id: "detected",
    label: "זוהה במצלמה",
    description: "אובייקט מסוים הופיע בשדה הראייה.",
    icon: "ScanEye",
    requires: {},
  },
  {
    id: "zone_enter",
    label: "נכנס לאזור",
    description: "אובייקט עבר מבחוץ לתוך אזור שהוגדר.",
    icon: "LogIn",
    requires: { zone: true },
  },
  {
    id: "zone_exit",
    label: "יצא מאזור",
    description: "אובייקט יצא מאזור שהוגדר.",
    icon: "LogOut",
    requires: { zone: true },
  },
  {
    id: "zone_presence",
    label: "נמצא באזור",
    description: "אובייקט נמצא בתוך אזור מסוים.",
    icon: "MapPin",
    requires: { zone: true },
  },
  {
    id: "dwell",
    label: "נשאר באזור זמן מסוים",
    description: "אובייקט נשאר באזור למשך זמן שהוגדר.",
    icon: "Timer",
    requires: { zone: true, duration: true },
  },
  {
    id: "line_cross",
    label: "חצה קו",
    description: "אובייקט עבר מצד אחד של קו לצד השני.",
    icon: "ArrowLeftRight",
    requires: { line: true },
  },
  {
    id: "count",
    label: "הכמות עברה סף",
    description: "צור אירוע כשמגיעים לכמות מסוימת באזור או בקו.",
    icon: "Hash",
    requires: { countMode: true },
  },
];

export const ACTION_BY_ID: Record<WizardActionId, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<WizardActionId, ActionDef>;

export const COUNT_MODES: { id: CountMode; label: string; description: string }[] = [
  { id: "zone", label: "באזור (כניסות)", description: "ספירת כניסות לאזור שנבחר." },
  { id: "zone_exit", label: "באזור (יציאות)", description: "ספירת יציאות מאזור שנבחר." },
  { id: "line", label: "בחציית קו", description: "ספירת חציות של קו שנבחר." },
];

/** Effective spatial requirement, taking the count mode into account. */
export function spatialRequirement(
  action: WizardActionId | null,
  countMode: CountMode | null,
): "zone" | "line" | null {
  if (!action) return null;
  if (action === "count") {
    if (countMode === "line") return "line";
    if (countMode === "zone" || countMode === "zone_exit") return "zone";
    return null;
  }
  const req = ACTION_BY_ID[action].requires;
  if (req.zone) return "zone";
  if (req.line) return "line";
  return null;
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export type Gender = "m" | "f";

export type ObjectDef = {
  id: WizardObjectId;
  label: string;
  /** Plural, for count sentences and names ("משאיות"). */
  plural: string;
  /** Grammatical gender of `label` (singular) — drives verb agreement in sentences. */
  gender: Gender;
  /** Grammatical gender of `plural`. */
  pluralGender: Gender;
  classes: string[];
  icon: "User" | "Car" | "Truck" | "Bike" | "Bus";
};

/** Authoritative vehicle group — re-exported from vision-capabilities SSOT. */
export const VEHICLE_CLASSES = [...VEHICLE_CLASSES_SSOT];

const OBJECT_ICON: Record<VisionObjectType, ObjectDef["icon"]> = {
  person: "User",
  vehicle: "Car",
  car: "Car",
  truck: "Truck",
  motorcycle: "Bike",
  bicycle: "Bike",
  bus: "Bus",
};

const OBJECT_PLURAL: Record<VisionObjectType, { plural: string; gender: Gender; pluralGender: Gender }> = {
  person: { plural: "אנשים", gender: "m", pluralGender: "m" },
  vehicle: { plural: "רכבים", gender: "m", pluralGender: "m" },
  car: { plural: "מכוניות", gender: "f", pluralGender: "f" },
  truck: { plural: "משאיות", gender: "f", pluralGender: "f" },
  motorcycle: { plural: "אופנועים", gender: "m", pluralGender: "m" },
  bicycle: { plural: "אופניים", gender: "m", pluralGender: "m" },
  bus: { plural: "אוטובוסים", gender: "m", pluralGender: "m" },
};

/** Object cards — order and classes from shared VisionCapabilities. */
export const OBJECTS: ObjectDef[] = OBJECT_TYPES.map((id) => ({
  id,
  label: OBJECT_TYPE_LABELS[id],
  plural: OBJECT_PLURAL[id].plural,
  gender: OBJECT_PLURAL[id].gender,
  pluralGender: OBJECT_PLURAL[id].pluralGender,
  classes: [...OBJECT_TYPE_TO_CLASSES[id]],
  icon: OBJECT_ICON[id],
}));

/** Hebrew verb forms used in rule sentences, by grammatical gender. */
export const VERBS = {
  enter: { m: "נכנס", f: "נכנסת" },
  exit: { m: "יוצא", f: "יוצאת" },
  presence: { m: "נמצא", f: "נמצאת" },
  stay: { m: "נשאר", f: "נשארת" },
  dwell: { m: "שוהה", f: "שוהה" },
  cross: { m: "חוצה", f: "חוצה" },
  detected: { m: "זוהה", f: "זוהתה" },
  enterPlural: { m: "נכנסים", f: "נכנסות" },
  exitPlural: { m: "יוצאים", f: "יוצאות" },
  crossPlural: { m: "חוצים", f: "חוצות" },
  countedPlural: { m: "נספרים", f: "נספרות" },
} as const;

export type VerbKey = keyof typeof VERBS;

export function verb(key: VerbKey, gender: Gender): string {
  return VERBS[key][gender];
}

/** Gender of the singular label for a class list (defaults to masculine for unknown classes). */
export function genderForClasses(classes: string[]): Gender {
  const id = objectForClasses(classes);
  return id ? OBJECT_BY_ID[id].gender : "m";
}

export function pluralGenderForClasses(classes: string[]): Gender {
  const id = objectForClasses(classes);
  return id ? OBJECT_BY_ID[id].pluralGender : "m";
}

export const OBJECT_BY_ID: Record<WizardObjectId, ObjectDef> = Object.fromEntries(
  OBJECTS.map((o) => [o.id, o]),
) as Record<WizardObjectId, ObjectDef>;

/** Find the wizard object whose class set equals the given classes (order-insensitive). */
export function objectForClasses(classes: string[]): WizardObjectId | null {
  const key = [...new Set(classes)].sort().join("|");
  for (const obj of OBJECTS) {
    if ([...obj.classes].sort().join("|") === key) return obj.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Capabilities — only combinations the backend can execute are offered.
// ---------------------------------------------------------------------------

export type VisionCapabilities = {
  /** Detector classes the current vision pipeline can produce. */
  detectionClasses: string[];
  /** Actions the Rule Engine implements. */
  actions: WizardActionId[];
};

/** Current Edge Hub capabilities (COCO subset + spatial rule engine). */
export const CURRENT_CAPABILITIES: VisionCapabilities = {
  detectionClasses: ["person", "car", "truck", "bus", "motorcycle", "bicycle"],
  actions: ["detected", "zone_enter", "zone_exit", "zone_presence", "dwell", "line_cross", "count"],
};

export function isObjectSupported(
  objectId: WizardObjectId,
  caps: VisionCapabilities = CURRENT_CAPABILITIES,
): boolean {
  return OBJECT_BY_ID[objectId].classes.every((c) => caps.detectionClasses.includes(c));
}

export function isCombinationSupported(
  action: WizardActionId,
  objectId: WizardObjectId,
  caps: VisionCapabilities = CURRENT_CAPABILITIES,
): boolean {
  return caps.actions.includes(action) && isObjectSupported(objectId, caps);
}

export function availableActions(caps: VisionCapabilities = CURRENT_CAPABILITIES): ActionDef[] {
  return ACTIONS.filter((a) => caps.actions.includes(a.id));
}

export function availableObjects(
  action: WizardActionId | null,
  caps: VisionCapabilities = CURRENT_CAPABILITIES,
): ObjectDef[] {
  return OBJECTS.filter((o) => (action ? isCombinationSupported(action, o.id, caps) : isObjectSupported(o.id, caps)));
}

// ---------------------------------------------------------------------------
// Durations / windows / thresholds (simple choices; custom remains possible)
// ---------------------------------------------------------------------------

export const DURATION_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 10, label: "10 שניות" },
  { seconds: 30, label: "30 שניות" },
  { seconds: 60, label: "דקה" },
  { seconds: 300, label: "5 דקות" },
];

export const WINDOW_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 300, label: "5 דקות" },
  { seconds: 600, label: "10 דקות" },
  { seconds: 1800, label: "חצי שעה" },
  { seconds: 3600, label: "שעה" },
];

export const THRESHOLD_CHOICES = [3, 5, 10, 20];

/** Hebrew weekday labels ordered Sunday→Saturday; `value` follows Python `weekday()` (Mon=0 … Sun=6). */
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 6, label: "ראשון", short: "א׳" },
  { value: 0, label: "שני", short: "ב׳" },
  { value: 1, label: "שלישי", short: "ג׳" },
  { value: 2, label: "רביעי", short: "ד׳" },
  { value: 3, label: "חמישי", short: "ה׳" },
  { value: 4, label: "שישי", short: "ו׳" },
  { value: 5, label: "שבת", short: "ש׳" },
];
