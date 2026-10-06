# Phase 0 — Completion

## Goal

Create the VisionLayer foundation: monorepo, contracts, skeletons, Docker,
docs, and isolation tests. **No product features.**

## Delivered

- Monorepo structure per architecture plan
- Shared JSON Schemas: Detection, Rule, Event, Skill Manifest, Metric,
  CounterState, VisionCapabilities
- Feature flags file + env override wiring in Edge API settings
- `VisionAdapter` Protocol + Mock stub + Dev/DeepStream/Hailo placeholders
- Edge API: FastAPI app, `/health`, `/ready`, config, logging, errors,
  EventBus abstraction, SQLAlchemy async + Alembic foundation migration
- Next.js shell: `lang=he` `dir=rtl`, Tailwind grayscale tokens, Lucide,
  centralized Hebrew copy — placeholder home only
- Docker Compose skeleton: edge-api, web, go2rtc (profile `media`)
- Docs: architecture.md, ADR 0001, ADR 0002, this phase note
- Tests: schema validation, hardware SDK isolation, health smoke, adapter protocol

## Explicitly not built (Phase 1+)

- Camera CRUD, RTSP, ONVIF
- AI detection / tracking
- Rules evaluation
- Events logic / clips
- Live video wiring
- Push / PWA install
- Cloud, Skills, NL rules, Semantic search

## Done criteria

- [x] Repo opens with documented layout
- [x] Schemas validate under tests
- [x] Product Layer has no hardware SDK imports (enforced by test)
- [x] Edge API health endpoint works
- [x] Web shell renders RTL Hebrew placeholder
- [x] `docker compose config` validates

## Verification (local)

- edge-api: 17 pytest passed, ruff clean
- vision: 1 pytest passed
- web: `tsc --noEmit` + `next lint` clean
- docker: `docker compose config` OK
- Note: local host Python is 3.11; Docker API image uses 3.12. `requires-python >=3.11`.

## Next

Phase 1 — Product Core with fake detections, Camera/Zone/Rule/Event CRUD,
and rule evaluation without real AI.
