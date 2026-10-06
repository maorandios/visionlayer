# Tracker — ByteTrack (Video Test Lab)

## Default

Video Test Lab uses **ByteTrack** behind `ByteTrackAdapter`.

```text
YOLOX ONNX → ByteTrackAdapter → Unified Detection Schema
```

IoU tracker remains available as a fallback/debug implementation (`tracker_kind="iou"`).

## Implementation / license

| Item | Value |
|------|--------|
| Algorithm | ByteTrack (Zhang et al., arXiv:2110.06864) |
| Code in repo | Clean-room NumPy implementation in `services/vision/trackers/bytetrack_core.py` |
| Adapter | `services/vision/trackers/bytetrack_adapter.py` |
| External package | **None** (no `boxmot` / AGPL) |
| Reference (not vendored) | Original ByteTrack repo is **MIT**: https://github.com/ifzhang/ByteTrack |
| Rejected option | BoxMOT — **AGPL-3.0** (unsuitable for proprietary shipping) |

This keeps VisionLayer free of GPL/AGPL tracker dependencies while using the published ByteTrack association method (high-score then low-score matching + Kalman).

## Configuration

Centralized in `services/vision/trackers/config.py` (`TrackerConfig` / `DEFAULT_TRACKER_CONFIG`):

| Field | Default | Meaning |
|-------|---------|---------|
| `track_activation_threshold` | `0.5` | High-confidence stage gate |
| `min_confidence` | `0.1` | Ignore weaker boxes |
| `match_threshold` | `0.8` | IoU match gate (cost = 1−IoU) |
| `lost_track_buffer` | `30` | Lost-track TTL, scaled by `fps/30` |
| `min_hits_to_activate` | `1` | Hits before emitting track |
| `default_fps` | `25.0` | Used only if video FPS missing |

Frame rate is taken from the uploaded video metadata whenever available.

## Class awareness

ByteTrack runs **per object class**. A `person` track cannot become a `car`.

## Diagnostics

Each analysis job metrics include `tracker_name` and `tracking_diagnostics`:
unique tracks, creations, losses, average lifetime, config snapshot.

## IoU vs ByteTrack comparison (dev fixture)

Script: `scripts/compare-iou-bytetrack.py` (scripted green-box MP4, 40 frames @ 10 FPS).

| Metric | IoU | ByteTrack |
|--------|-----|-----------|
| Unique tracks | 1 | 1 |
| ID changes along timeline | 0 | 0 |
| Processing FPS (approx) | ~1600 | ~1500 |
| Events / schema | unchanged | unchanged |

On this simple single-object fixture both keep one ID. ByteTrack adds Kalman prediction + two-stage (high/low confidence) association and per-class isolation, which matter more under occlusion and crowded overlap — covered by unit tests in `services/vision/tests/test_bytetrack.py`.

### Known limitations

- Clean-room greedy assignment (no SciPy Hungarian); fine for Video Test Lab scale.
- No ReID appearance model (pure motion/IoU ByteTrack).
- CPU YOLOX remains the main analysis bottleneck, not the tracker.
