# VisionLayer Architecture

## Purpose

VisionLayer adds an intelligence layer on top of existing IP cameras (RTSP / ONVIF)
for homes and businesses. The system runs primarily on **Edge hardware** at the
customer site, with an optional Cloud control plane later.

## Critical separation

| Layer | Responsibility | Must not |
| --- | --- | --- |
| **Vision Runtime** (`services/vision`) | Frames, detect, track, emit unified schemas | Know about users, billing, rules UI |
| **Product Layer** (`services/edge-api`) | Cameras, zones, rules, events, users, push, live, skills, SaaS | Import DeepStream / TensorRT / HailoRT / CUDA |

All vision backends implement `VisionAdapter` and emit the Detection schema under
`shared/schemas/detection.schema.json`.

## Runtime topology (target)

```text
PWA (Next.js) ──REST/WS──► Edge API (FastAPI modular monolith)
        │                         │
        └──WebRTC──► go2rtc ◄──RTSP── IP cameras
                                      │
                                      └──► Vision process ──detections──► Event Bus ──► Zones/Rules/Events
```

Phase 0 ships skeletons only — no camera wiring, no AI, no rule evaluation.

## Monorepo layout

```text
apps/web                 Next.js Hebrew-first PWA shell
services/edge-api        Product Layer modular monolith
services/vision          VisionAdapter process (mock stub in Phase 0)
services/notifications   Placeholder (Phase 7)
services/edge-agent      Placeholder (Phase 10)
skills/                  Skill packages (Phase 12)
shared/schemas           JSON Schema contracts (source of truth)
shared/config            Feature flags defaults
infra/docker             Compose + Dockerfiles + go2rtc placeholder
docs/                    Architecture, ADRs, phase notes
```

## Contracts

- Detection, Rule, Event, Skill Manifest, Metric, CounterState, VisionCapabilities
  live in `shared/schemas/`.
- Feature flags: `shared/config/features.yaml` with `FEATURE_*` env overrides.

## Edge / Cloud

- **Edge** owns video, detection, local rules, events, recording, SQLite.
- **Cloud** (Phase 9+) owns orgs, subscriptions, hub registry, sync.
- Offline: detection and rules continue; sync when connectivity returns.

## Security (designed now, implemented gradually)

- Camera credentials encrypted at rest (Phase 3)
- Auth sessions / JWT (Phase 1)
- No public RTSP exposure; Live via go2rtc WebRTC (Phase 8)
- Device tokens for hubs (Phase 10)

## Hebrew / RTL / Mobile

- `<html lang="he" dir="rtl">`
- Centralized copy in `apps/web/src/i18n/he.ts`
- Mobile-first layout; desktop sidebar later (same IA)
- Grayscale design tokens only in Phase 0

## Related docs

- [ADR 0001 — Hardware-agnostic Vision Adapter](adr/0001-hardware-agnostic-vision-adapter.md)
- [ADR 0002 — Modular Monolith for Edge API](adr/0002-modular-monolith-edge-api.md)
- [Phase 0 completion](phases/phase-0.md)
