/**
 * Central configuration for the Rule Wizard: actions, objects, capability mapping, templates.
 * All conditional behaviour of the wizard derives from this file.
 */
import type { CountMode, RuleWizardState, WizardActionId, WizardObjectId } from "@/lib/rule-wizard/types";

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
    label: "נשאר באזור",
    description: "אובייקט נשאר באזור למשך זמן שהוגדר.",
    icon: "Timer",
    requires: { zone: true, duration: true },
  },
  {
    id: "line_cross",
    label: "חצה קו",
    description: "אובייקט עבר מצד אחד של קו לצד השני.",
    icon: "ArrowLeftRight",
    requires: { line: true, direction: true },
  },
  {
    id: "count",
    label: "ספירת אובייקטים",
    description: "ספור אובייקטים שמבצעים פעולה מסוימת.",
    icon: "Hash",
    requires: { countMode: true },
  },
];

export const ACTION_BY_ID: Record<WizardActionId, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<WizardActionId, ActionDef>;

export const COUNT_MODES: { id: CountMode; label: string; description: string }[] = [
  { id: "zone", label: "כאשר נכנס לאזור", description: "כל כניסה לאזור נספרת פעם אחת." },
  { id: "zone_exit", label: "כאשר יוצא מאזור", description: "כל יציאה מהאזור נספרת פעם אחת." },
  { id: "line", label: "כאשר חוצה קו", description: "כל חצייה של הקו נספרת פעם אחת." },
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

export const VEHICLE_CLASSES = ["car", "truck", "bus", "motorcycle"];

export const OBJECTS: ObjectDef[] = [
  { id: "person", label: "אדם", plural: "אנשים", gender: "m", pluralGender: "m", classes: ["person"], icon: "User" },
  { id: "vehicle", label: "רכב", plural: "רכבים", gender: "m", pluralGender: "m", classes: VEHICLE_CLASSES, icon: "Car" },
  { id: "car", label: "מכונית", plural: "מכוניות", gender: "f", pluralGender: "f", classes: ["car"], icon: "Car" },
  { id: "truck", label: "משאית", plural: "משאיות", gender: "f", pluralGender: "f", classes: ["truck"], icon: "Truck" },
  { id: "motorcycle", label: "אופנוע", plural: "אופנועים", gender: "m", pluralGender: "m", classes: ["motorcycle"], icon: "Bike" },
  { id: "bicycle", label: "אופניים", plural: "אופניים", gender: "m", pluralGender: "m", classes: ["bicycle"], icon: "Bike" },
  { id: "bus", label: "אוטובוס", plural: "אוטובוסים", gender: "m", pluralGender: "m", classes: ["bus"], icon: "Bus" },
];

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

// ---------------------------------------------------------------------------
// Templates — a template is just a preconfigured partial wizard state.
// ---------------------------------------------------------------------------

export type TemplateCategory = "security" | "vehicles" | "operations";

export type TemplateDef = {
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  icon: ActionDef["icon"] | ObjectDef["icon"] | "ShieldAlert" | "Moon" | "Users";
  preset: Partial<RuleWizardState>;
};

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "security", label: "אבטחה" },
  { id: "vehicles", label: "רכבים" },
  { id: "operations", label: "תפעול" },
];

export const TEMPLATES: TemplateDef[] = [
  // --- אבטחה
  {
    id: "person_enter",
    category: "security",
    title: "אדם נכנס לאזור",
    description: "צור אירוע בכל פעם שאדם נכנס לאזור שתגדיר.",
    icon: "LogIn",
    preset: { action: "zone_enter", object: "person" },
  },
  {
    id: "person_forbidden",
    category: "security",
    title: "אדם נמצא באזור אסור",
    description: "צור אירוע כשאדם נמצא בתוך אזור שאסור להימצא בו.",
    icon: "ShieldAlert",
    preset: { action: "zone_presence", object: "person" },
  },
  {
    id: "person_dwell",
    category: "security",
    title: "אדם נשאר באזור זמן ממושך",
    description: "צור אירוע כשאדם נשאר באזור יותר מדקה.",
    icon: "Timer",
    preset: { action: "dwell", object: "person", durationSeconds: 60 },
  },
  {
    id: "person_after_hours",
    category: "security",
    title: "אדם מזוהה בשעות סגירה",
    description: "צור אירוע כשאדם מופיע במצלמה בין 22:00 ל־06:00.",
    icon: "Moon",
    preset: {
      action: "detected",
      object: "person",
      schedule: { mode: "custom", from: "22:00", to: "06:00", days: null },
    },
  },
  // --- רכבים
  {
    id: "vehicle_enter",
    category: "vehicles",
    title: "רכב נכנס",
    description: "צור אירוע בכל פעם שרכב נכנס לאזור שתגדיר.",
    icon: "LogIn",
    preset: { action: "zone_enter", object: "vehicle" },
  },
  {
    id: "vehicle_exit",
    category: "vehicles",
    title: "רכב יוצא",
    description: "צור אירוע בכל פעם שרכב יוצא מאזור שתגדיר.",
    icon: "LogOut",
    preset: { action: "zone_exit", object: "vehicle" },
  },
  {
    id: "truck_enter",
    category: "vehicles",
    title: "משאית נכנסת",
    description: "צור אירוע בכל פעם שמשאית עוברת דרך שער שהגדרת.",
    icon: "Truck",
    preset: { action: "line_cross", object: "truck" },
  },
  {
    id: "vehicle_cross_gate",
    category: "vehicles",
    title: "רכב חוצה שער",
    description: "צור אירוע בכל פעם שרכב חוצה קו שתסמן על התמונה.",
    icon: "ArrowLeftRight",
    preset: { action: "line_cross", object: "vehicle" },
  },
  {
    id: "vehicle_count",
    category: "vehicles",
    title: "ספירת רכבים",
    description: "ספור רכבים שחוצים שער, וצור אירוע כשמגיעים לכמות.",
    icon: "Hash",
    preset: { action: "count", object: "vehicle", countMode: "line", countThresholdEnabled: true },
  },
  // --- תפעול
  {
    id: "people_count",
    category: "operations",
    title: "ספירת אנשים",
    description: "ספור אנשים שנכנסים לאזור, וצור אירוע כשמגיעים לכמות.",
    icon: "Users",
    preset: { action: "count", object: "person", countMode: "zone", countThresholdEnabled: true },
  },
  {
    id: "truck_count",
    category: "operations",
    title: "ספירת משאיות",
    description: "ספור משאיות שחוצות שער, וצור אירוע כשמגיעים לכמות.",
    icon: "Truck",
    preset: { action: "count", object: "truck", countMode: "line", countThresholdEnabled: true },
  },
  {
    id: "zone_occupancy",
    category: "operations",
    title: "תפוסת אזור",
    description: "צור אירוע כשיותר מדי אנשים נכנסים לאזור בפרק זמן קצר.",
    icon: "MapPin",
    preset: {
      action: "count",
      object: "person",
      countMode: "zone",
      countThresholdEnabled: true,
      countThreshold: 10,
      countWindowSeconds: 600,
    },
  },
];

export const TEMPLATE_BY_ID: Record<string, TemplateDef> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Which wizard questions a template already answers (those steps are skipped). */
export function templateDefines(template: TemplateDef): { action: boolean; object: boolean; countMode: boolean } {
  return {
    action: template.preset.action != null,
    object: template.preset.object != null,
    countMode: template.preset.countMode != null,
  };
}
