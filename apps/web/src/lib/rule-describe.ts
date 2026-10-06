/**
 * Human-readable (Hebrew) description of a rule — no internal schema terms.
 * Single source of truth for rule sentences (rules list, camera workspace, wizard preview, review).
 *
 *   כאשר: רכב חוצה את "שער A" בכיוון כניסה
 *   איפה: חניון ראשי
 *   מתי:  08:00–18:00
 *   פעולה: שליחת התראה
 */
import { objectClassHe } from "@/lib/format";
import {
  OBJECT_BY_ID,
  WEEKDAYS,
  genderForClasses,
  objectForClasses,
  pluralGenderForClasses,
  verb,
} from "@/lib/rule-wizard/config";
import type { Rule } from "@/lib/types";

export type RuleNames = {
  cameraName?: (id: string | null | undefined) => string;
  zoneName?: (id: string | null | undefined) => string;
  lineName?: (id: string | null | undefined) => string;
  /** True for the auto-created "כל שדה הראייה" zone → the rule reads as "זוהה במצלמה". */
  isFullFrameZone?: (id: string | null | undefined) => boolean;
  /** Human-readable direction name for a line ("כניסה"), or null to use the default. */
  directionLabel?: (lineId: string | null | undefined, direction: string | null | undefined) => string | null;
};

export type RuleDescription = {
  when: string;
  where: string;
  schedule: string | null;
  action: string;
  triggerLabel: string;
  triggerKind: TriggerKind;
};

export type TriggerKind = "zone" | "line" | "dwell" | "count";

const TRIGGER_LABEL: Record<TriggerKind, string> = {
  zone: "כניסה / יציאה / נוכחות",
  line: "חציית קו",
  dwell: "שהייה ממושכת",
  count: "סף ספירה",
};

export const TRIGGER_FILTERS: { id: "all" | TriggerKind; label: string }[] = [
  { id: "all", label: "כל הסוגים" },
  { id: "zone", label: TRIGGER_LABEL.zone },
  { id: "line", label: TRIGGER_LABEL.line },
  { id: "dwell", label: TRIGGER_LABEL.dwell },
  { id: "count", label: TRIGGER_LABEL.count },
];

function quoted(name: string): string {
  return name && name !== "—" ? `"${name}"` : "";
}

export function triggerKind(rule: Rule): TriggerKind {
  const c = rule.conditions;
  const trig = c.trigger;
  if (trig === "count_threshold" || c.threshold != null || c.aggregation) return "count";
  if (trig === "dwell") return "dwell";
  if (trig === "line_cross" || c.line_id) return "line";
  if (trig === "zone_presence" && (c.min_duration_seconds ?? 0) > 0) return "dwell";
  return "zone";
}

/** Object label for a class list: wizard group label ("רכב") when it matches, else joined classes. */
export function objectLabel(classes: string[] | undefined): string {
  const list = classes ?? [];
  const id = objectForClasses(list);
  if (id) return OBJECT_BY_ID[id].label;
  return list.map((c) => objectClassHe(c)).join(" / ") || "אובייקט";
}

export function objectPlural(classes: string[] | undefined): string {
  const list = classes ?? [];
  const id = objectForClasses(list);
  if (id) return OBJECT_BY_ID[id].plural;
  const map: Record<string, string> = {
    person: "אנשים",
    car: "מכוניות",
    truck: "משאיות",
    bus: "אוטובוסים",
    bicycle: "אופניים",
    motorcycle: "אופנועים",
    dog: "כלבים",
    cat: "חתולים",
  };
  return list.map((c) => map[c] ?? objectClassHe(c)).join(" / ") || "אובייקטים";
}

export function defaultDirectionLabel(dir: string | null | undefined): string | null {
  if (dir === "a_to_b") return "כניסה";
  if (dir === "b_to_a") return "יציאה";
  return null;
}

function directionHe(names: RuleNames, lineId: string | null | undefined, dir: string | null | undefined): string {
  if (!dir || dir === "any") return "";
  const label = names.directionLabel?.(lineId, dir) ?? defaultDirectionLabel(dir);
  return label ? ` בכיוון ${label}` : "";
}

function operatorHe(op: string | null | undefined): string {
  switch (op) {
    case "gt":
      return "יותר מ־";
    case "eq":
      return "בדיוק";
    case "lte":
      return "לכל היותר";
    case "lt":
      return "פחות מ־";
    default:
      return "לפחות";
  }
}

export function windowHe(seconds: number | null | undefined): string {
  if (!seconds) return "";
  if (seconds % 3600 === 0) return ` בתוך ${seconds / 3600 === 1 ? "שעה" : `${seconds / 3600} שעות`}`;
  if (seconds % 60 === 0) return ` בתוך ${seconds / 60 === 1 ? "דקה" : `${seconds / 60} דקות`}`;
  return ` בתוך ${seconds} שניות`;
}

export function durationHe(seconds: number): string {
  if (seconds % 3600 === 0 && seconds >= 3600) return seconds === 3600 ? "שעה" : `${seconds / 3600} שעות`;
  if (seconds % 60 === 0 && seconds >= 60) return seconds === 60 ? "דקה" : `${seconds / 60} דקות`;
  return `${seconds} שניות`;
}

export function scheduleHe(schedule: Rule["conditions"]["schedule"]): string | null {
  if (!schedule) return null;
  const allDay = schedule.from === "00:00" && (schedule.to === "23:59" || schedule.to === "24:00");
  const days = schedule.days && schedule.days.length > 0 ? schedule.days : null;
  if (allDay && !days) return null;
  const parts: string[] = [];
  if (days) {
    const ordered = WEEKDAYS.filter((d) => days.includes(d.value));
    if (ordered.length === 7) {
      // all days
    } else if (ordered.length >= 3 && isConsecutive(ordered.map((d) => WEEKDAYS.indexOf(d)))) {
      parts.push(`${ordered[0].label}–${ordered[ordered.length - 1].label}`);
    } else {
      parts.push(ordered.map((d) => d.label).join(", "));
    }
  }
  if (!allDay) parts.push(`${schedule.from}–${schedule.to}`);
  return parts.join(" ") || null;
}

function isConsecutive(indexes: number[]): boolean {
  for (let i = 1; i < indexes.length; i += 1) if (indexes[i] !== indexes[i - 1] + 1) return false;
  return true;
}

export function describeRule(rule: Rule, names: RuleNames = {}): RuleDescription {
  const c = rule.conditions;
  const kind = triggerKind(rule);
  const classes = c.object_classes ?? [];
  const obj = objectLabel(classes);
  const g = genderForClasses(classes);
  const pg = pluralGenderForClasses(classes);
  const zone = quoted(names.zoneName?.(c.zone_id) ?? "");
  const line = quoted(names.lineName?.(c.line_id) ?? "");
  const fullFrame = Boolean(c.zone_id && names.isFullFrameZone?.(c.zone_id));

  let when: string;
  switch (kind) {
    case "line":
      when = `${obj} ${verb("cross", g)} את ${line || "הקו"}${directionHe(names, c.line_id, c.direction)}`;
      break;
    case "dwell": {
      const secs = c.min_duration_seconds ?? 0;
      when = `${obj} ${verb("dwell", g)} ב${zone || "אזור"} יותר מ־${durationHe(secs)}`;
      break;
    }
    case "count": {
      const threshold = c.threshold ?? c.count ?? c.aggregation?.threshold ?? 0;
      const op = operatorHe(c.operator ?? c.aggregation?.operator);
      const win = c.aggregation_window_seconds ?? c.aggregation?.window_seconds;
      const countOnExit = c.aggregation?.count_on === "zone_exit";
      const where = line
        ? `${verb("crossPlural", pg)} את ${line}${directionHe(names, c.line_id, c.direction)}`
        : zone
          ? countOnExit
            ? `${verb("exitPlural", pg)} מ${zone}`
            : `${verb("enterPlural", pg)} ל${zone}`
          : verb("countedPlural", pg);
      when = `${op} ${threshold} ${objectPlural(classes)} ${where}${windowHe(win)}`;
      break;
    }
    default: {
      const trig = c.trigger;
      if (fullFrame && trig !== "zone_enter" && trig !== "zone_exit") {
        when = `${obj} ${verb("detected", g)} במצלמה`;
        break;
      }
      const v =
        trig === "zone_enter" ? `${verb("enter", g)} ל` : trig === "zone_exit" ? `${verb("exit", g)} מ` : `${verb("presence", g)} ב`;
      when = `${obj} ${v}${zone || "אזור"}`;
      if (trig !== "zone_enter" && trig !== "zone_exit" && (c.min_duration_seconds ?? 0) > 0) {
        when += ` יותר מ־${durationHe(c.min_duration_seconds ?? 0)}`;
      }
    }
  }

  const hasPush = rule.actions.some((a) => a.type === "push_notification");
  const action = hasPush ? "שליחת התראה ויצירת אירוע" : "יצירת אירוע";

  return {
    when,
    where: names.cameraName?.(c.camera_id) ?? (c.camera_id || "—"),
    schedule: scheduleHe(c.schedule),
    action,
    triggerLabel: TRIGGER_LABEL[kind],
    triggerKind: kind,
  };
}

/**
 * One-line sentence used by the wizard preview / review / success screens:
 *   כאשר משאית חוצה את "שער הכניסה" בכיוון כניסה במצלמת "שער ראשי" בין 22:00–06:00 — צור אירוע.
 */
export function ruleSentence(rule: Rule, names: RuleNames = {}): string {
  const d = describeRule(rule, names);
  const schedule = d.schedule ? ` ${d.schedule.includes("–") && !/[א-ת]/.test(d.schedule) ? "בין " : ""}${d.schedule}` : "";
  const outcome = rule.actions.some((a) => a.type === "push_notification") ? "שלח התראה וצור אירוע" : "צור אירוע";
  return `כאשר ${whenWithCamera(d)}${schedule} — ${outcome}.`;
}

const DETECTED_SUFFIX = /^(.*) (זוהה|זוהתה) במצלמה$/;

/** "אדם זוהה במצלמת "שער"" / "משאית חוצה את "קו" במצלמת "שער"". */
export function whenWithCamera(d: Pick<RuleDescription, "when" | "where">): string {
  const hasCamera = d.where && d.where !== "—";
  if (!hasCamera) return d.when;
  const m = DETECTED_SUFFIX.exec(d.when);
  if (m) return `${m[1]} ${m[2]} במצלמת "${d.where}"`;
  return `${d.when} במצלמת "${d.where}"`;
}

export { TRIGGER_LABEL };
