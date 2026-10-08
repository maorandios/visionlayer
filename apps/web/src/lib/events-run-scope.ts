import type { EventItem } from "@/lib/types";

/**
 * For test-video cameras, keep only Events from the newest analysis_run_id
 * present in the feed (per camera). Production Events (no run id) pass through.
 * Assumes `events` are ordered newest-first.
 */
export function scopeEventsToLatestTestRuns(events: EventItem[]): EventItem[] {
  const latestRunByCamera = new Map<string, string>();
  for (const e of events) {
    if (!e.source_analysis_run_id) continue;
    if (!latestRunByCamera.has(e.camera_id)) {
      latestRunByCamera.set(e.camera_id, e.source_analysis_run_id);
    }
  }
  return events.filter((e) => {
    if (!e.source_analysis_run_id) return true;
    return latestRunByCamera.get(e.camera_id) === e.source_analysis_run_id;
  });
}
