# ADR 0001 — Hardware-agnostic Vision Adapter

## Status

Accepted (Phase 0)

## Context

VisionLayer may run on NVIDIA Jetson (DeepStream / TensorRT) or Raspberry Pi /
CM5 with Hailo (HailoRT / GStreamer). Hardware choice is not final. Locking the
Product Layer to one runtime would force rewrites and block dual-SKU support.

## Decision

1. Define a single `VisionAdapter` Protocol in `services/vision/adapters/base.py`.
2. Every backend (mock, dev, deepstream, hailo) implements that protocol.
3. Adapters emit only the unified Detection JSON Schema — never product types.
4. Product Layer (`services/edge-api`) consumes detections via bus/API contracts only.
5. Hardware SDKs may exist only under `services/vision/adapters/{deepstream,hailo}/`
   (Phase 11). Automated tests forbid importing them from the Product Layer.

## Consequences

- Product features (rules, events, UI) develop against Fake/Mock detections early.
- Switching or dual-shipping hardware backends does not change Edge API domains.
- Slight indirection cost; gained portability and testability.
