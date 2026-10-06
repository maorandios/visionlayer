# Metrics Engine + UX Reorganization

Status: implemented. Alembic revision `0007_metrics_engine`.

## 1. Architecture

```
Detections ──► DetectionPipeline ──► Spatial layer (zones / lines / dwell)
                      │                     │
                      │                     ├──► Rule engine ──► Events (what the user asked to be told about)
                      │                     │
                      └── TrackObservation ─┴──► MetricsEngine ──► metric_ledger  (idempotency)
                                                                ──► metric_samples (hour + day buckets)
                                                                ──► metric_state   (live occupancy)
                                                                          │
                                              GET /api/v1/metrics/{summary,timeseries,breakdown}
                                                                          │
                                          Home · Insights · Camera ▸ מדדים · Video Lab ▸ מדדי ההרצה
```

Metrics are **independent of rules**: every enabled zone / line produces spatial events and every
detection produces a `TrackObservation`, so counts exist even when no rule matches. Events remain the
"something happened that you asked about" layer; metrics are the "what is happening in the space" layer.

Code: `services/edge-api/app/domain/metrics/{engine.py,queries.py}`, API in `app/api/metrics.py`,
schemas in `app/api/metrics_schemas.py`.

## 2. Tables (migration 0007)

| table | purpose | key |
| --- | --- | --- |
| `metric_samples` | accumulated values per (scope, run, metric, dimensions, bucket, bucket_start) | `sample_key` unique |
| `metric_ledger` | one row per processed source occurrence → idempotency | `source_key` PK |
| `metric_state` | live state that is not a time series (current occupancy per zone) | `state_key` PK |

Dimension columns on `metric_samples`: `scope, analysis_run_id, site_id, camera_id, zone_id, line_id,
object_class, direction, metric_type`. Adding a dimension or metric type is a new column / constant,
not a new table. Value columns: `value, count, sum_value, min_value, max_value, peak_at`.

Buckets: `hour` and `day` are written today. `bucket_start()` already supports `week` / `month`; adding
them is a one-line change in `BUCKETS` (schema unchanged).

Timezone: buckets are computed in `VL_METRICS_TIMEZONE` (default `Asia/Jerusalem`) and stored as UTC
instants, so "today" is the user's day, not the UTC day.

## 3. Metric types

| metric_type | +1 when | dims | notes |
| --- | --- | --- | --- |
| `zone_entries` | `zone_enter` | camera, zone, object_class | |
| `zone_exits` | `zone_exit` | camera, zone, object_class | |
| `line_crossings` | `line_cross` | camera, line, object_class, direction | |
| `unique_objects` | first time a (camera, class, track_id) is seen in the scope/run | camera, object_class | 100 frames of the same car → 1 |
| `dwell` | `zone_exit` with duration | camera, zone, object_class | `value` = total seconds, `count` = completed sessions, `min/max` kept → avg/max |
| `occupancy_peak` | `zone_enter` | camera, zone | `max_value` = peak within the bucket, `peak_at` timestamp |
| occupancy (live) | enter/exit | camera, zone | `metric_state`: set of active track ids → `current`, plus `peak`/`peak_at` |

Vehicle / person groups used by the UI: `vehicle = {car, truck, bus, motorcycle}`, `person = {person}`.
`object_class=vehicle` / `object_class=person` are accepted by the API as group filters.

Dwell sessions and occupancy are closed either by a real `zone_exit`, by **stale-track expiry**
(a track not seen for `stale_track_gap_sec` = 5 s of video time is exited at its last-seen time), or by
`finalize=True` at the end of a Video Lab batch. These synthetic exits feed metrics only — they never
trigger rules.

## 4. Idempotency strategy

Every source occurrence gets a deterministic `source_key` written to `metric_ledger` in the same
transaction as the sample upserts:

```
{scope}|{analysis_run_id or -}|{occurrence_id}|{kind}            # zone_enter / zone_exit / line_cross
{scope}|{analysis_run_id or -}|unique|{camera_id}|{class}|{track} # unique object
```

`occurrence_id` is the stable id already produced by the spatial layer (`ZonePresenceTracker`,
`LineCrossingTracker`). Before applying deltas the engine filters keys through an in-memory LRU and then
through a chunked `SELECT` on the ledger; keys already present are dropped. Re-sending the same
detections (retry, replay, restart) therefore never double counts. Tested in
`tests/test_metrics_engine.py::test_idempotent_same_source_twice` and `test_persists_across_restart`.

## 5. Production vs Video Lab (analysis-run isolation)

| scope | written by | `analysis_run_id` | included in Home / Insights by default |
| --- | --- | --- | --- |
| `production` | real camera feeds (future RTSP) and the `/simulate` endpoints | `null` | yes |
| `video_lab` | Video Lab analysis | Video Lab job id (= Benchmark Run id) | **no** |

* Re-running analysis on the same video creates a new run id → a fresh, isolated set of samples. Old
  runs stay queryable (`?scope=video_lab&analysis_run_id=…`) and never leak into production totals.
* Video Lab timestamps are anchored to wall-clock at analysis start, so hour/day buckets exist for
  Video Lab runs as well; the UI shows them per run (Video Lab ▸ "מדדי ההרצה") and in Insights only
  when a developer flips the scope toggle (dev environment only).
* Events: production summaries count events with `source_analysis_run_id IS NULL`; Video Lab summaries
  count events of the run.
* Simulation (`/api/v1/simulate/*`) writes to `production` on purpose — it stands in for a real feed
  until RTSP exists. It is dev-flag gated (`FEATURE_SIMULATE_DETECTIONS`).

End-to-end example (`tests/test_metrics_engine.py::test_scope_isolation_video_lab_runs`):
7 cars + 2 trucks cross "Gate A" in run_1 → `line_crossings = 9`, breakdown by class `car 7 / truck 2`;
`production` scope for the same camera stays 0.

## 6. API

All endpoints require auth. Common filters: `scope` (`production` | `video_lab`, default production),
`analysis_run_id`, `from`, `to` (ISO 8601), `camera_id`, `zone_id`, `line_id`, `object_class`
(class or `vehicle` / `person`), `direction`.

* `GET /api/v1/metrics/summary` → totals, dwell summary, live occupancy list, peak occupancy,
  by_class, vehicles, persons, events_total.
* `GET /api/v1/metrics/timeseries?metric_type=…&bucket=hour|day` → `[{bucket_start, value, count}]`
  (`dwell` → average seconds, `occupancy_peak` → max).
* `GET /api/v1/metrics/breakdown?metric_type=…&by=camera|zone|line|object_class|direction`
  → `[{key, value, count}]`.

Typed contracts: `app/api/metrics_schemas.py` (backend) and `apps/web/src/lib/types.ts` (frontend).

## 7. UX reorganization

Navigation (`apps/web/src/lib/navigation.ts` is the single source of truth):

* Mobile bottom nav (5): בית · אירועים · מצלמות · תובנות · עוד
* Desktop sidebar: בית · אירועים · מצלמות · חוקים ואוטומציות · תובנות · הגדרות, then a dashed
  "כלי פיתוח" section (מעבדת וידאו, סימולציה, היסטוריית benchmark) shown only in a development
  environment **and** when the matching feature flag is on.
* "עוד": ניהול (חוקים ואוטומציות, הגדרות) → מערכת (account, אודות) → כלי פיתוח.

Screens: Home (status · today summary from metrics · attention · recent media-first events),
Cameras (cards with zones/lines/active rules counts; Video Lab virtual cameras grouped as "מקור פיתוח"),
Camera workspace (`?tab=` סקירה / אזורים וקווים / חוקים / אירועים / מדדים / הגדרות), Rules & automations
(filters + human-readable cards via `lib/rule-describe.ts`), Insights (KPIs, one hourly/daily chart,
one breakdown at a time, occupancy), Events (media-first list + detail with collapsed technical
details), Settings (מערכת / התראות / אחסון / משתמשים / אודות; unfinished groups behind flags).

Shared primitives: `PageHeader, SectionHeader, Chip, Tabs, KpiCard, ConfirmDialog, BarChart,
EmptyBlock(hint, action), Button(size)`. All touch targets ≥ 44 px (`min-h-11`).

## 8. Known limitations

* Occupancy "current" relies on stale-track expiry (5 s); a camera that stops sending frames keeps the
  last value until the next batch arrives.
* Week/month buckets are not materialised yet (schema + `bucket_start` ready).
* Events created before this phase have no `source_analysis_run_id`, so very old Video Lab events still
  appear in production event counts.
* Camera settings tab exposes enable/disable/delete; location/name editing still uses the existing
  `/cameras/[id]/edit` form.
