import { describe, expect, it } from "vitest";
import {
  eventTypeIcon,
  formatEventTime,
  formatDurationHe,
  groupEventsByDate,
} from "@/lib/event-timeline";
import type { EventItem } from "@/lib/types";

function ev(over: Partial<EventItem> & Pick<EventItem, "id" | "started_at">): EventItem {
  return {
    camera_id: "c1",
    rule_id: "r1",
    type: "zone_enter",
    severity: "warning",
    object_class: "person",
    track_id: null,
    zone_id: "z1",
    confidence: null,
    ended_at: null,
    state: "new",
    message_he: "אדם נכנס לאזור",
    payload: {},
    created_at: over.started_at,
    ...over,
  };
}

describe("groupEventsByDate", () => {
  it("orders newest first and groups by day", () => {
    const now = new Date("2026-10-08T12:00:00");
    const events = [
      ev({ id: "1", started_at: "2026-10-08T09:52:00" }),
      ev({ id: "2", started_at: "2026-10-08T08:17:00" }),
      ev({ id: "3", started_at: "2026-10-07T23:48:00" }),
      ev({ id: "4", started_at: "2026-10-06T18:00:00" }),
    ];
    const groups = groupEventsByDate(events, now);
    expect(groups[0]!.label).toBe("היום");
    expect(groups[1]!.label).toBe("אתמול");
    expect(groups[2]!.label).toMatch(/6/);
    expect(groups[2]!.label.toLowerCase()).toMatch(/אוק/);
    expect(groups[0]!.events.map((e) => e.id)).toEqual(["1", "2"]);
    expect(groups[1]!.events[0]!.id).toBe("3");
  });

  it("formats time without date", () => {
    const t = formatEventTime("2026-10-08T09:52:00");
    expect(t).toMatch(/09:52|9:52/);
  });
});

describe("event icons", () => {
  it("maps behavior types", () => {
    expect(eventTypeIcon("zone_enter").displayName || eventTypeIcon("zone_enter").name).toBeTruthy();
    expect(eventTypeIcon("line_cross")).not.toBe(eventTypeIcon("dwell"));
    expect(eventTypeIcon("count_threshold")).toBeTruthy();
  });
});

describe("duration", () => {
  it("formats dwell seconds", () => {
    expect(formatDurationHe(45)).toContain("שניות");
    expect(formatDurationHe(763)).toMatch(/12:43/);
  });
});
