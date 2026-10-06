# Video Lab — Performance Benchmark

Date: 2026-10-05  
Host: development PC (CPU / ONNX Runtime)  
Priority: good-enough detection + responsive PC (not max CPU)

## Recommended development defaults

| Setting | Value | Env |
|---------|-------|-----|
| Model | **yolox_s** | `VISION_YOLOX_MODEL` |
| Frame stride | **3** | `VISION_FRAME_STRIDE` |
| ORT intra_op threads | **4** | `VISION_ONNX_INTRA_OP_THREADS` |
| ORT inter_op threads | **1** | `VISION_ONNX_INTER_OP_THREADS` |
| OpenCV threads | **2** | `VISION_OPENCV_NUM_THREADS` |
| Concurrent analyses | **1** | (hard lock) |
| Tracker | **ByteTrack** | (unchanged) |

Rationale: YOLOX-M @ stride 1 saturates the machine (~0.4 processing FPS on a short clip). YOLOX-S @ stride 2 keeps analysis near interactive (~12 processing FPS on the same clip) while preserving video timestamps for duration rules.

## Measured results

### Scripted detector (stride sanity)

| Config | Analysis time | Detector calls | Processing FPS | Unique tracks |
|--------|---------------|----------------|----------------|---------------|
| stride=1 | ~0.06 s | 60 | ~1018 | 1 |
| stride=2 | ~0.03 s | 30 | ~955 | 1 |
| stride=3 | ~0.02 s | 20 | ~1018 | 1 |

Stride correctly reduces detector calls (`ceil(frames/stride)`) while timestamps remain video-based.

### ONNX on local test clip (40 frames)

| Config | Analysis time | Detector calls | Processing FPS | Notes |
|--------|---------------|----------------|----------------|-------|
| YOLOX-M stride 1 | **~101 s** | 40 | **0.4** | Heavy — locks up the PC |
| YOLOX-S stride 2 | **~1.7 s** | 20 | **~12** | Recommended |
| YOLOX-S stride 3 | **~1.2 s** | 14 | **~12** | Faster; slightly coarser tracking |

Detection counts on this particular clip were 0 under ONNX (clip is a synthetic / non-COCO scene used for wiring). Relative CPU cost is still representative.

### Before → after (development default)

| Metric | Before (typical) | After (default) |
|--------|------------------|-----------------|
| Model | yolox_m | yolox_s |
| Stride | 1 | 2 |
| ORT threads | unbounded / all cores | 4 / 1 |
| OpenCV threads | default | 2 |
| Analysis time (same 40-frame clip) | ~100 s | ~1.7 s |
| Processing FPS | ~0.4 | ~12 |
| Parallel jobs | unrestricted | single job lock |

## Gallery UX

After analysis the UI shows a **Detection Results Gallery**: one card per unique `track_id`, with a representative JPEG (`data/test-results/{job_id}/track_XXXX.jpg`) drawing **only that object's** bounding box. Source video is optional under «הצג סרטון מקור». Rules/events remain below the gallery. Performance metrics live in a collapsible «אבחון פיתוח» section.

## Known limitations

- No ReID — fragmented tracks may still produce extra cards (diagnostics warn when many short same-class tracks appear).
- Stride > 1 coarsens tracker updates; duration rules still use video timestamps.
- YOLOX-M remains available for higher-quality offline runs via `VISION_YOLOX_MODEL=yolox_m` and `VISION_FRAME_STRIDE=1`.

Raw JSON: [`video-lab-perf-benchmark.json`](video-lab-perf-benchmark.json)  
Reproduce: `python scripts/benchmark-video-lab-perf.py`
