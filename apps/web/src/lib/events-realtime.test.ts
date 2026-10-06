import { describe, expect, it } from "vitest";
import { applyWsMessage, nextReconnectDelayMs } from "@/lib/events-realtime";
import type { EventItem } from "@/lib/types";

const sample = (id: string): EventItem => ({
  id,
  camera_id: "cam1",
  zone_id: "z1",
  rule_id: "r1",
  type: "zone_presence",
  object_class: "person",
  track_id: 1,
  confidence: 0.9,
  severity: "info",
  state: "open",
  message_he: "אירוע בדיקה",
  started_at: "2026-01-01T12:00:00Z",
  ended_at: null,
  payload: {},
  created_at: "2026-01-01T12:00:00Z",
});

describe("realtime events", () => {
  it("prepends created events", () => {
    const { events, created } = applyWsMessage([], {
      type: "event.created",
      event: sample("e1"),
    });
    expect(created?.id).toBe("e1");
    expect(events).toHaveLength(1);
  });

  it("dedupes by id", () => {
    const prev = [sample("e1")];
    const { events } = applyWsMessage(prev, {
      type: "event.created",
      event: sample("e1"),
    });
    expect(events).toHaveLength(1);
  });

  it("exponential backoff caps at 30s", () => {
    expect(nextReconnectDelayMs(1000)).toBe(2000);
    expect(nextReconnectDelayMs(20000)).toBe(30000);
    expect(nextReconnectDelayMs(30000)).toBe(30000);
  });
});
