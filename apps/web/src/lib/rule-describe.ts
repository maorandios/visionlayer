/**
 * Human-readable (Hebrew) description of a rule — no internal schema terms.
 *
 *   כאשר: רכב חוצה את "שער A" בכיוון כניסה
 *   איפה: חניון ראשי
 *   מתי:  08:00–18:00
 *   פעולה: שליחת התראה
 */
import { objectClassHe } from "@/lib/format";
import type { Rule } from "@/lib/types";

export type RuleNames = {
  cameraName?: (id: string | null | undefined) => string;
  zoneName?: (id: string | null | undefined) => string;
  lineName?: (id: string | null | undefined) => string;
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

function directionHe(dir: string | null | undefined): string {
  if (dir === "a_to_b") return " בכיוון כניסה";
  if (dir === "b_to_a") return " בכיוון יציאה";
  return "";
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

function pluralObjects(cls: string): string {
  const map: Record<string, string> = {
    person: "אנשים",
    car: "רכבים",
    truck: "משאיות",
    bus: "אוטובוסים",
    bicycle: "אופניים",
    motorcycle: "אופנועים",
    dog: "כלבים",
    cat: "חתולים",
  };
  return map[cls] ?? objectClassHe(cls);
}

function windowHe(seconds: number | null | undefined): string {
  if (!seconds) return "";
  if (seconds % 3600 === 0) return ` בתוך ${seconds / 3600} שעות`;
  if (seconds % 60 === 0) return ` בתוך ${seconds / 60} דקות`;
  return ` בתוך ${seconds} שניות`;
}

export function describeRule(rule: Rule, names: RuleNames = {}): RuleDescription {
  const c = rule.conditions;
  const kind = triggerKind(rule);
  const cls = c.object_classes?.[0] ?? "";
  const obj = objectClassHe(cls);
  const zone = quoted(names.zoneName?.(c.zone_id) ?? "");
  const line = quoted(names.lineName?.(c.line_id) ?? "");

  let when: string;
  switch (kind) {
    case "line":
      when = `${obj} חוצה את ${line || "הקו"}${directionHe(c.direction)}`;
      break;
    case "dwell": {
      const secs = c.min_duration_seconds ?? 0;
      when = `${obj} שוהה ב${zone || "אזור"} יותר מ־${secs} שניות`;
      break;
    }
    case "count": {
      const threshold = c.threshold ?? c.count ?? c.aggregation?.threshold ?? 0;
      const op = operatorHe(c.operator ?? c.aggregation?.operator);
      const win = c.aggregation_window_seconds ?? c.aggregation?.window_seconds;
      const where = line ? `חוצים את ${line}` : zone ? `נכנסים ל${zone}` : "נספרים";
      when = `${op} ${threshold} ${pluralObjects(cls)} ${where}${windowHe(win)}`;
      break;
    }
    default: {
      const trig = c.trigger;
      const verb =
        trig === "zone_enter" ? "נכנס ל" : trig === "zone_exit" ? "יוצא מ" : "נמצא ב";
      when = `${obj} ${verb}${zone || "אזור"}`;
      if (trig !== "zone_enter" && trig !== "zone_exit" && (c.min_duration_seconds ?? 0) > 0) {
        when += ` יותר מ־${c.min_duration_seconds} שניות`;
      }
    }
  }

  const schedule =
    c.schedule && !(c.schedule.from === "00:00" && (c.schedule.to === "23:59" || c.schedule.to === "24:00"))
      ? `${c.schedule.from}–${c.schedule.to}`
      : null;

  const hasPush = rule.actions.some((a) => a.type === "push_notification");
  const action = hasPush ? "שליחת התראה ויצירת אירוע" : "יצירת אירוע";

  return {
    when,
    where: names.cameraName?.(c.camera_id) ?? (c.camera_id || "—"),
    schedule,
    action,
    triggerLabel: TRIGGER_LABEL[kind],
    triggerKind: kind,
  };
}

export { TRIGGER_LABEL };
