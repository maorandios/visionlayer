# Edge API overview

Phase 0 endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Service info + feature flags |
| GET | `/health` | Liveness |
| GET | `/ready` | Readiness (includes DB check) |

OpenAPI UI: `/docs` when the API is running.

## Phase 1 endpoints

| Area | Methods |
| --- | --- |
| Auth | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` |
| Cameras | `GET/POST /api/v1/cameras`, `GET/PATCH/DELETE /api/v1/cameras/{id}`, enable/disable |
| Zones | `GET/POST /api/v1/cameras/{id}/zones`, `GET/PATCH/DELETE /api/v1/zones/{id}` |
| Rules | `GET/POST /api/v1/rules`, validate, duplicate, `GET/PATCH/DELETE /api/v1/rules/{id}` |
| Events | `GET /api/v1/events`, `GET /api/v1/events/{id}`, `PATCH .../acknowledge` |
| Simulate | `POST /api/v1/simulate/detection`, `POST /api/v1/simulate/scenario` |

Product UI screens start in Phase 2.

## Metrics endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/metrics/summary` | Totals, dwell, live occupancy, by-class / vehicles / persons |
| GET | `/api/v1/metrics/timeseries?metric_type=&bucket=hour\|day` | Persistent hour/day buckets |
| GET | `/api/v1/metrics/breakdown?metric_type=&by=camera\|zone\|line\|object_class\|direction` | One-dimension breakdown |

Common filters: `scope` (`production` default, `video_lab`), `analysis_run_id`, `from`, `to`,
`camera_id`, `zone_id`, `line_id`, `object_class` (class or group `vehicle` / `person`), `direction`.
Details, idempotency and production vs Video Lab isolation: `docs/phases/metrics-engine.md`.
