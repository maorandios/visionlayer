/**
 * Events timeline helpers — date grouping, icons, display copy.
 * Events are chronological history (no workflow states).
 */
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Bell,
  Clock,
  Eye,
  LogIn,
  LogOut,
  Users,
} from "lucide-react";
import type { EventItem } from "@/lib/types";

export type EventDateGroup = {
  key: string;
  label: string;
  events: EventItem[];
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sort newest first, then group by local calendar day. */
export function groupEventsByDate(
  events: EventItem[],
  now: Date = new Date(),
): EventDateGroup[] {
  const sorted = [...events].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(yesterday);

  const map = new Map<string, EventItem[]>();
  for (const ev of sorted) {
    const d = new Date(ev.started_at);
    const key = dayKey(d);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }

  const groups: EventDateGroup[] = [];
  for (const [key, items] of map) {
    let label: string;
    if (key === todayKey) label = "היום";
    else if (key === yesterdayKey) label = "אתמול";
    else {
      const d = new Date(items[0]!.started_at);
      label = new Intl.DateTimeFormat("he-IL", {
        day: "numeric",
        month: "long",
      })
        .formatToParts(d)
        .filter((p) => p.type === "day" || p.type === "month" || p.type === "literal")
        .map((p) => p.value)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    groups.push({ key, label, events: items });
  }
  return groups;
}

/** Clock time only — date is in the section heading. */
export function formatEventTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function eventTitle(event: EventItem, fallbackObject: string): string {
  return event.message_he?.trim() || fallbackObject;
}

/** Lucide icon for event/rule behavior (not workflow state). */
export function eventTypeIcon(type: string): LucideIcon {
  switch (type) {
    case "zone_enter":
      return LogIn;
    case "zone_exit":
      return LogOut;
    case "line_cross":
      return ArrowLeftRight;
    case "dwell":
      return Clock;
    case "count_threshold":
      return Users;
    case "zone_presence":
    case "presence":
    case "rule_match":
      return Eye;
    default:
      return Bell;
  }
}

export function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function formatDurationHe(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} שניות`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")} דקות`;
}

export function directionLabelHe(dir: string | null | undefined): string | null {
  if (!dir || dir === "any") return null;
  if (dir === "a_to_b") return "כניסה";
  if (dir === "b_to_a") return "יציאה";
  return null;
}
