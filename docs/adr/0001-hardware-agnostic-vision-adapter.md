# ADR 0001 — Hardware-agnostic Vision Boundary

## Status

Accepted (Phase 0). **Updated** after pre-Jetson architecture cleanup to match code.

## Context

VisionLayer may run on NVIDIA Jetson (DeepStream / TensorRT / NvDCF) or other
hardware. Locking Product Logic to YOLOX/ByteTrack would force rewrites.

## Decision

1. **Official Product façade:** `services/vision/boundary.py`
   - `analyze_uploaded_video(...)` for AI Test / finite files
   - `vision_capabilities()` / `vision_health()`
   - Future: continuous stream start/stop on the **same** module
2. **Development backend** lives behind the façade (`lab_api` + YOLOX + ByteTrack).
   Product must not import detector/tracker classes.
3. Backends emit only the Unified Detection JSON Schema
   (`shared/schemas/detection.schema.json` + `detection_contract.py`).
4. Product Layer (`edge-api`) consumes detections via `DetectionPipeline` only.
5. Hardware SDKs may exist only under `services/vision/adapters/{deepstream,hailo}/`.
6. VisionLayer **custom spatial engine** remains Product-owned (not nvdsanalytics) for v1.
7. `VisionAdapter` Protocol remains the stream-oriented companion API; stream
   backends should implement it and still emit the same Detection contract.

## Consequences

- Switching YOLOX→DeepStream does not rewrite Metrics, Rules, Events, or UI.
- AI Test and future live cameras share one boundary.
- Slight indirection; gained portability and a FakeVisionBackend contract test.
