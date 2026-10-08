# DeepStream adapter (placeholder)

**Status:** Not implemented. Do not import NVIDIA SDKs here yet.

## Contract

When implemented, this package must:

1. Run decode + TensorRT inference + NvDCF (or equivalent) under Jetson/DeepStream.
2. Map detector-native class IDs through `services/vision/class_mapping.py`.
3. Emit **only** Unified Detection objects validated by `detection_contract.validate_detection`.
4. Expose analysis through `services/vision/boundary.py` (same Product-facing façade).

## Must emit

See `shared/schemas/detection.schema.json` and `detection_contract.py`:

- `class` — VisionLayer canonical name (never raw COCO/DeepStream numeric ids)
- `bbox` — `[x1,y1,x2,y2]` in **full original frame** pixels (unmap letterbox/mux)
- `timestamp` — absolute Unix seconds for Product time
- `video_timestamp_sec` — media-relative seconds when analyzing files
- `frame_index` — when a seekable source exists
- `track_id` — NvDCF integer id for the current stream/run
- `frame_size` — original frame `[width, height]`
- `source` — `"deepstream"`

## Must NOT

- Call MetricsEngine / Rule Engine / spatial trackers
- Emit DeepStream analytics (nvdsanalytics) as a replacement for VisionLayer spatial
- Leak TensorRT / Gst / pyds types into `edge-api`

Product path after DeepStream:

```text
DeepStreamVisionBackend → boundary.analyze_* → Detection[] → DetectionPipeline → Spatial → Metrics/Rules
```
