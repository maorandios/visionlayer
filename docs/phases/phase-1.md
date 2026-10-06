# Phase 1 — Completion

## Goal

Product Core without real cameras or real AI:

`Fake Detection → Zone → Rule → Event → SQLite`

## Delivered

- Camera CRUD (logical entities; enable/disable)
- Zone CRUD (polygon, normalized 0–1, Hebrew name, enabled)
- Polygon containment using detection bbox bottom-center
- Rule CRUD + validation (object, camera, zone, schedule, duration, cooldown, push action schema)
- Pure Rule Engine + ZonePresenceTracker (`track_id`)
- DetectionPipeline on Event Bus (unified Detection schema only)
- Event persistence + list/get/acknowledge
- Simulation API: `/api/v1/simulate/detection`, `/api/v1/simulate/scenario`
- Scenarios: person_enter_zone, person_loiter_zone, person_leave_zone, truck_enter_zone
- SQLite schema + Alembic `0002_phase1_product_core` (WAL, FK)
- Local admin auth (bcrypt + JWT): login / logout / me
- Unit + integration tests

## Explicitly not built (Phase 2+)

- Real UI screens / PWA install
- RTSP / ONVIF / Live / recordings / thumbnails
- Real AI / DeepStream / Hailo
- Actual push sending
- Cloud / MQTT / Skills / NL / Semantic Search

## Done criteria

- [x] CRUD works for cameras, zones, rules, events
- [x] Fake detections use unified Detection contract via Event Bus
- [x] Zone membership + duration + schedule + cooldown
- [x] Matching rules create events; non-matching do not
- [x] Automated tests pass
- [x] Phase 2 not started
