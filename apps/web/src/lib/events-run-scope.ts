import type { EventItem } from "@/lib/types";

export type LatestRunByCamera =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string | null | undefined>>;

function lookupLatest(map: LatestRunByCamera | undefined, cameraId: string): string | undefined {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(cameraId);
  const v = (map as Record<string, string | null | undefined>)[cameraId];
  return v ?? undefined;
}

/**
 * Scope Events to the latest successful AI Test run per camera.
 *
 * Prefer an authoritative ``latestRunByCamera`` map from the API
 * (same source as ``GET /cameras/{id}/ai-test`` → ``latest_successful_run``).
 *
 * When the map is omitted (tests / offline), fall back to newest run id
 * observed in a newest-first event feed — legacy behaviour only.
 *
 * Production Events without ``source_analysis_run_id`` always pass through.
 */
export function scopeEventsToLatestTestRuns(
  events: EventItem[],
  latestRunByCamera?: LatestRunByCamera,
): EventItem[] {
  const inferred = new Map<string, string>();
  if (!latestRunByCamera) {
    for (const e of events) {
      if (!e.source_analysis_run_id) continue;
      if (!inferred.has(e.camera_id)) {
        inferred.set(e.camera_id, e.source_analysis_run_id);
      }
    }
  }

  return events.filter((e) => {
    if (!e.source_analysis_run_id) return true;
    const latest =
      lookupLatest(latestRunByCamera, e.camera_id) ?? inferred.get(e.camera_id);
    if (!latest) return false;
    return e.source_analysis_run_id === latest;
  });
}

/** Filter camera Events to one authoritative run id (camera panel). */
export function scopeEventsToRun(
  events: EventItem[],
  cameraId: string,
  latestRunId: string | null | undefined,
): EventItem[] {
  if (!latestRunId) return [];
  return events.filter(
    (e) => e.camera_id === cameraId && e.source_analysis_run_id === latestRunId,
  );
}
