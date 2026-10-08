# Event Media boundary

## What Event Media needs today (MP4 AI Test)

From Detection / Event payloads:

| Field | Use |
|-------|-----|
| `timestamp` | Absolute event time |
| `video_timestamp_sec` | Seek window on the source file |
| `frame_index` | Preferential OpenCV seek |
| `bbox` | Draw overlay on snapshot |
| `track_id` | Match gallery / representative frame |
| Source video path | `VideoLabAsset.stored_path` (seekable file) |

Implementation: `edge-api/app/domain/media/` (OpenCV snapshots, FFmpeg clips).

## Future live RTSP (not implemented)

When cameras are continuous RTSP:

1. Vision backend still emits the same Detection contract.
2. A **segment / ring-buffer recorder** must retain recent frames or GOP segments keyed by time.
3. Event Media will resolve `(camera_id, timestamp)` → recorded segment instead of seeking an uploaded MP4.
4. DeepStream may use NVENC later — optional; not required for contract correctness.

This cleanup sprint does **not** implement ring buffers or NVENC.
