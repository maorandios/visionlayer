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
