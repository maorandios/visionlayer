# ADR 0002 — Modular Monolith for Edge API

## Status

Accepted (Phase 0)

## Context

The roadmap lists logical services (rules, events, notifications). Splitting into
networked microservices immediately adds deploy, latency, and debugging overhead
that slows a single developer building toward MVP.

## Decision

1. Ship **one FastAPI process** (`services/edge-api`) through Phase 8.
2. Keep **clear domain packages** under `app/domain/*` and adapters under
   `app/adapters/*`.
3. Use an **EventBus protocol** (`InProcessEventBus` now; MQTT later) so modules
   do not call each other through hidden globals.
4. Keep Vision as a **separate process** from Phase 4 because inference isolation
   and hardware SDKs differ from product API concerns.
5. Split into real services only when Cloud / Edge Agent boundaries require it
   (Phases 9–10).

## Consequences

- Faster local development and simpler Docker Compose.
- Domain boundaries must be disciplined (reviews + package structure).
- Future extraction is possible without rewriting business logic.
