import type { EventItem, WsMessage } from "@/lib/types";

/** Apply a WebSocket payload to the in-memory events list (dedupe by id). */
export function applyWsMessage(
  events: EventItem[],
  msg: WsMessage,
): { events: EventItem[]; created?: EventItem } {
  if (msg.type !== "event.created" || !msg.event) {
    return { events };
  }
  if (events.some((e) => e.id === msg.event!.id)) {
    return { events };
  }
  return { events: [msg.event, ...events], created: msg.event };
}

export function nextReconnectDelayMs(currentMs: number, maxMs = 30_000): number {
  return Math.min(currentMs * 2, maxMs);
}
