/**
 * Pure conversions between the user-facing RuleWizardState and the Rule Engine schema.
 *
 *   RuleWizardState  ──wizardToRule──►  Rule payload (conditions / actions)   ← source of truth
 *   Rule             ──ruleToWizard──►  RuleWizardState (+ legacy notes for things the wizard can't edit)
 */
import { OBJECT_BY_ID, TEMPLATE_BY_ID, VEHICLE_CLASSES, objectForClasses, verb } from "@/lib/rule-wizard/config";
import { DEFAULT_WIZARD_STATE, type LegacyInfo, type RuleWizardState, type WizardActionId } from "@/lib/rule-wizard/types";
import { objectClassHe } from "@/lib/format";
import type { Rule, RuleAction, RuleConditions, Zone } from "@/lib/types";

export type RulePayload = {
  name: string;
  enabled: boolean;
  conditions: RuleConditions;
  actions: RuleAction[];
  cooldown_seconds: number;
};

// ---------------------------------------------------------------------------
// Full-frame zone ("כל שדה הראייה") — how "זוהה במצלמה" maps onto the zone-based engine.
// ---------------------------------------------------------------------------

export const FULL_FRAME_ZONE_NAME = "כל שדה הראייה";
/** Placeholder zone id used by the live preview before the full-frame zone exists. */
export const FULL_FRAME_PLACEHOLDER_ID = "__full_frame__";
export const FULL_FRAME_POINTS: number[][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export function isFullFramePoints(points: number[][] | undefined | null, tolerance = 0.02): boolean {
  if (!points || points.length !== 4) return false;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return (
    Math.min(...xs) <= tolerance &&
    Math.min(...ys) <= tolerance &&
    Math.max(...xs) >= 1 - tolerance &&
    Math.max(...ys) >= 1 - tolerance
  );
}

export function isFullFrameZone(zone: Pick<Zone, "points"> | null | undefined): boolean {
  return Boolean(zone && isFullFramePoints(zone.points));
}

export function findFullFrameZone(zones: Zone[], cameraId: string): Zone | null {
  return zones.find((z) => z.camera_id === cameraId && isFullFrameZone(z)) ?? null;
}

// ---------------------------------------------------------------------------
// Template application
// ---------------------------------------------------------------------------

export function applyTemplate(state: RuleWizardState, templateId: string): RuleWizardState {
  const tpl = TEMPLATE_BY_ID[templateId];
  if (!tpl) return { ...state, templateId };
  return {
    ...state,
    ...tpl.preset,
    method: "template",
    templateId,
    // spatial selections depend on the camera, not the template
    zoneId: state.zoneId,
    lineId: state.lineId,
  };
}

// ---------------------------------------------------------------------------
// Wizard → Rule
// ---------------------------------------------------------------------------

function isAllDay(from: string, to: string): boolean {
  return from === "00:00" && (to === "23:59" || to === "24:00" || to === "00:00");
}

export function wizardToRule(state: RuleWizardState, opts: { name?: string } = {}): RulePayload {
  if (!state.action) throw new Error("wizardToRule: action is required");

  const objectClasses =
    state.object != null ? [...OBJECT_BY_ID[state.object].classes] : [...(state.legacy?.objectClasses ?? [])];

  const conditions: RuleConditions = {
    object_classes: objectClasses,
    camera_id: state.cameraId,
  };

  switch (state.action) {
    case "detected":
      conditions.trigger = "zone_presence";
      conditions.zone_id = state.zoneId; // full-frame zone, resolved by the wizard before save
      conditions.min_duration_seconds = 0;
      break;
    case "zone_enter":
    case "zone_exit":
      conditions.trigger = state.action;
      conditions.zone_id = state.zoneId;
      break;
    case "zone_presence":
      conditions.trigger = "zone_presence";
      conditions.zone_id = state.zoneId;
      conditions.min_duration_seconds = state.legacy?.presenceDurationSeconds ?? 0;
      break;
    case "dwell":
      conditions.trigger = "dwell";
      conditions.zone_id = state.zoneId;
      conditions.min_duration_seconds = state.durationSeconds;
      break;
    case "line_cross":
      conditions.trigger = "line_cross";
      conditions.line_id = state.lineId;
      conditions.direction = state.direction;
      break;
    case "count": {
      const viaLine = state.countMode === "line";
      const viaExit = state.countMode === "zone_exit";
      if (viaLine) {
        conditions.line_id = state.lineId;
        conditions.direction = state.direction;
      } else {
        conditions.zone_id = state.zoneId;
      }
      if (state.countThresholdEnabled) {
        const operator = state.legacy?.countOperator ?? "gte";
        conditions.trigger = "count_threshold";
        conditions.operator = operator;
        conditions.threshold = state.countThreshold;
        conditions.count = state.countThreshold;
        conditions.aggregation_window_seconds = state.countWindowSeconds;
        conditions.aggregation = {
          metric: "unique_objects",
          window_seconds: state.countWindowSeconds,
          operator,
          threshold: state.countThreshold,
          ...(viaExit ? { count_on: "zone_exit" } : {}),
        };
      } else {
        // No threshold: each occurrence is recorded as the matching spatial event.
        conditions.trigger = viaLine ? "line_cross" : viaExit ? "zone_exit" : "zone_enter";
      }
      break;
    }
  }

  if (state.schedule.mode === "custom" && !(isAllDay(state.schedule.from, state.schedule.to) && !state.schedule.days)) {
    conditions.schedule = {
      from: state.schedule.from,
      to: state.schedule.to,
      ...(state.schedule.days && state.schedule.days.length > 0 ? { days: [...state.schedule.days] } : {}),
    };
  }

  const actions: RuleAction[] = [{ type: "create_event" }];
  if (state.outcome.notify) actions.push({ type: "push_notification" });

  return {
    name: (opts.name ?? state.name).trim(),
    enabled: state.enabled,
    conditions,
    actions,
    cooldown_seconds: state.cooldownSeconds,
  };
}

/**
 * A Rule-shaped object for the live preview (same describeRule utility as the rest of the product).
 * Returns null until an action is chosen.
 */
export function previewRule(state: RuleWizardState): Rule | null {
  if (!state.action) return null;
  if (!state.object && !state.legacy?.objectClasses?.length) return null;
  // "זוהה במצלמה" resolves its full-frame zone only on save; preview with a placeholder id.
  const effective =
    state.action === "detected" && !state.zoneId ? { ...state, zoneId: FULL_FRAME_PLACEHOLDER_ID } : state;
  const payload = wizardToRule(effective);
  return {
    id: "preview",
    name: payload.name,
    enabled: payload.enabled,
    conditions: payload.conditions,
    actions: payload.actions,
    cooldown_seconds: payload.cooldown_seconds,
    last_triggered_at: null,
    created_at: "",
    updated_at: "",
  };
}

// ---------------------------------------------------------------------------
// Rule → Wizard
// ---------------------------------------------------------------------------

/** Mirrors the backend `infer_trigger`. */
export function inferTrigger(c: RuleConditions): string {
  if (c.trigger) return c.trigger;
  if (c.line_id) return "line_cross";
  if (c.threshold != null || c.count != null || c.aggregation_window_seconds || c.aggregation) return "count_threshold";
  return "zone_presence";
}

export type RuleToWizardOptions = {
  /** Zones of the system — used to recognise the full-frame zone ("זוהה במצלמה"). */
  zones?: Zone[];
};

export function ruleToWizard(rule: Rule, opts: RuleToWizardOptions = {}): RuleWizardState {
  const c = rule.conditions;
  const trigger = inferTrigger(c);
  const notes: string[] = [];
  const legacy: LegacyInfo = { notes, objectClasses: null, countOperator: null, presenceDurationSeconds: null };

  // object
  const classes = c.object_classes ?? [];
  let object = objectForClasses(classes);
  if (!object && classes.length === 1 && VEHICLE_CLASSES.includes(classes[0])) object = objectForClasses(classes);
  if (!object) {
    legacy.objectClasses = [...classes];
    notes.push(`סוג האובייקט "${classes.map((x) => objectClassHe(x)).join(", ")}" נשמר כפי שהוא ואינו ניתן לעריכה כאן.`);
  }

  // action
  let action: WizardActionId;
  let countMode: RuleWizardState["countMode"] = null;
  let countThresholdEnabled = DEFAULT_WIZARD_STATE.countThresholdEnabled;
  let countThreshold = DEFAULT_WIZARD_STATE.countThreshold;
  let countWindowSeconds = DEFAULT_WIZARD_STATE.countWindowSeconds;
  let durationSeconds = DEFAULT_WIZARD_STATE.durationSeconds;

  const zone = c.zone_id ? (opts.zones ?? []).find((z) => z.id === c.zone_id) : undefined;
  const minDur = c.min_duration_seconds ?? 0;

  switch (trigger) {
    case "zone_enter":
    case "zone_exit":
      action = trigger;
      break;
    case "dwell":
      action = "dwell";
      durationSeconds = minDur > 0 ? minDur : DEFAULT_WIZARD_STATE.durationSeconds;
      break;
    case "line_cross":
      action = "line_cross";
      break;
    case "count_threshold": {
      action = "count";
      countMode = c.line_id ? "line" : c.aggregation?.count_on === "zone_exit" ? "zone_exit" : "zone";
      countThresholdEnabled = true;
      const threshold = Number(c.threshold ?? c.count ?? c.aggregation?.threshold ?? DEFAULT_WIZARD_STATE.countThreshold);
      countThreshold = Number.isFinite(threshold) && threshold >= 1 ? threshold : DEFAULT_WIZARD_STATE.countThreshold;
      const win = Number(c.aggregation_window_seconds ?? c.aggregation?.window_seconds ?? DEFAULT_WIZARD_STATE.countWindowSeconds);
      countWindowSeconds = Number.isFinite(win) && win >= 1 ? win : DEFAULT_WIZARD_STATE.countWindowSeconds;
      const op = (c.operator ?? c.aggregation?.operator ?? "gte") as NonNullable<LegacyInfo["countOperator"]>;
      if (op !== "gte") {
        legacy.countOperator = op;
        notes.push("תנאי הכמות של חוק זה משתמש בהשוואה מתקדמת שנשמרת כפי שהיא.");
      }
      break;
    }
    default: {
      // zone_presence
      if (minDur <= 0 && isFullFrameZone(zone)) {
        action = "detected";
      } else {
        action = "zone_presence";
        if (minDur > 0) {
          legacy.presenceDurationSeconds = minDur;
          notes.push(`החוק דורש נוכחות של לפחות ${minDur} שניות — ההגדרה נשמרת כפי שהיא.`);
        }
      }
    }
  }

  // schedule
  let schedule: RuleWizardState["schedule"] = { mode: "always" };
  if (c.schedule && !(isAllDay(c.schedule.from, c.schedule.to) && !c.schedule.days?.length)) {
    schedule = {
      mode: "custom",
      from: c.schedule.from,
      to: c.schedule.to,
      days: c.schedule.days && c.schedule.days.length > 0 ? [...c.schedule.days] : null,
    };
  }

  const hasLegacy = notes.length > 0;

  return {
    ...DEFAULT_WIZARD_STATE,
    cameraId: c.camera_id ?? null,
    method: "custom",
    templateId: null,
    action,
    object,
    zoneId: c.zone_id ?? null,
    lineId: c.line_id ?? null,
    direction: (c.direction as RuleWizardState["direction"]) || "any",
    durationSeconds,
    countMode,
    countThresholdEnabled,
    countThreshold,
    countWindowSeconds,
    schedule,
    outcome: { createEvent: true, notify: rule.actions.some((a) => a.type === "push_notification") },
    name: rule.name,
    enabled: rule.enabled,
    cooldownSeconds: rule.cooldown_seconds,
    legacy: hasLegacy || legacy.objectClasses || legacy.countOperator || legacy.presenceDurationSeconds ? legacy : null,
  };
}

// ---------------------------------------------------------------------------
// Name suggestion
// ---------------------------------------------------------------------------

export type NameContext = {
  zoneName?: (id: string | null | undefined) => string;
  lineName?: (id: string | null | undefined) => string;
  directionLabel?: (lineId: string | null | undefined, direction: string | null | undefined) => string | null;
};

function cleanName(name: string | undefined): string {
  if (!name || name === "—") return "";
  return name.trim();
}

/** Short Hebrew rule name, e.g. "משאית חוצה שער כניסה", "אדם נכנס למחסן". */
export function suggestRuleName(state: RuleWizardState, ctx: NameContext = {}): string {
  if (!state.action) return "";
  const obj = state.object
    ? OBJECT_BY_ID[state.object]
    : {
        label: (state.legacy?.objectClasses ?? []).map((x) => objectClassHe(x)).join(", ") || "אובייקט",
        plural: "אובייקטים",
        gender: "m" as const,
      };
  const g = obj.gender;
  const zone = cleanName(ctx.zoneName?.(state.zoneId));
  const line = cleanName(ctx.lineName?.(state.lineId));

  switch (state.action) {
    case "detected":
      return `${obj.label} ${verb("detected", g)} במצלמה`;
    case "zone_enter":
      return `${obj.label} ${verb("enter", g)} ל${zone || "אזור"}`;
    case "zone_exit":
      return `${obj.label} ${verb("exit", g)} מ${zone || "אזור"}`;
    case "zone_presence":
      return `${obj.label} ${verb("presence", g)} ב${zone || "אזור"}`;
    case "dwell":
      return `${obj.label} ${verb("stay", g)} ב${zone || "אזור"} ${durationShort(state.durationSeconds)}`;
    case "line_cross": {
      const dir = state.direction !== "any" ? ctx.directionLabel?.(state.lineId, state.direction) : null;
      return `${obj.label} ${verb("cross", g)} ${line || "קו"}${dir ? ` — ${dir}` : ""}`;
    }
    case "count": {
      const place = state.countMode === "line" ? line : zone;
      return `ספירת ${obj.plural}${place ? ` — ${place}` : ""}`;
    }
    default:
      return "";
  }
}

export function durationShort(seconds: number): string {
  if (seconds % 3600 === 0 && seconds >= 3600) return seconds === 3600 ? "שעה" : `${seconds / 3600} שעות`;
  if (seconds % 60 === 0 && seconds >= 60) return seconds === 60 ? "דקה" : `${seconds / 60} דקות`;
  return `${seconds} שניות`;
}

export function windowShort(seconds: number): string {
  return durationShort(seconds);
}
