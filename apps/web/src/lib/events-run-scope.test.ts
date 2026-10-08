import { describe, expect, it } from "vitest";
import { scopeEventsToLatestTestRuns } from "@/lib/events-run-scope";
import type { EventItem } from "@/lib/types";

function ev(partial: Partial<EventItem> & { id: string; camera_id: string }): EventItem {
  return {
    rule_id: null,
    type: "zone_enter",
    severity: "info",
    object_class: "person",
    track_id: 1,
    zone_id: null,
    confidence: 0.9,
    started_at: "2026-10-08T10:00:00Z",
    ended_at: null,
    state: "new",
    message_he: null,
    payload: {},
    created_at: "2026-10-08T10:00:00Z",
    ...partial,
  };
}

describe("scopeEventsToLatestTestRuns", () => {
  it("keeps only the newest analysis_run_id per test camera", () => {
    const list = [
      ev({ id: "e3", camera_id: "vcam_1", source_analysis_run_id: "run_b" }),
      ev({ id: "e2", camera_id: "vcam_1", source_analysis_run_id: "run_a" }),
      ev({ id: "e1", camera_id: "vcam_1", source_analysis_run_id: "run_a" }),
      ev({ id: "p1", camera_id: "cam_1" }),
    ];
    const scoped = scopeEventsToLatestTestRuns(list);
    expect(scoped.map((e) => e.id)).toEqual(["e3", "p1"]);
  });
});
