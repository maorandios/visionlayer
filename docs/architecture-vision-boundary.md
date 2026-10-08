# Vision Boundary & NVIDIA Migration Contract

**Status:** Authoritative after architecture cleanup (pre-Jetson).  
**Official Product import:** `services/vision/boundary.py`

## Official flow

```text
Camera / Test Source
↓
Vision Backend
  - Development: YOLOX + ByteTrack (via lab_api internals)
  - Future: DeepStream + TensorRT + NvDCF
  - Fake/Mock: contract-only emitters
↓
OFFICIAL VISION BOUNDARY  (boundary.analyze_uploaded_video / future stream APIs)
↓
Unified Detection  (shared/schemas/detection.schema.json)
↓
DetectionPipeline
↓
VisionLayer Spatial Engine   ← unchanged; not DeepStream nvdsanalytics
├── Metrics Engine
└── Rule Engine → Events → Event Media → API / UI
```

Nothing below Unified Detection knows which detector/runtime produced the data.

## Entrypoints

| Module | Role |
|--------|------|
| `boundary.py` | **Only** Product-facing façade |
| `lab_api.py` | Development backend implementation (YOLOX/ByteTrack factories) |
| `adapters/deepstream/` | Placeholder — must emit same Detection contract |
| `adapters/fake.py` | Contract-only backend for replaceability tests |
| `VisionAdapter` Protocol | Long-term stream-oriented API; DevelopmentDetectorAdapter wraps lab internals |

AI Test / Video Lab **must** call `boundary.analyze_uploaded_video`, not detector classes.

## Detection contract (summary)

See `detection_contract.py` and `detection.schema.json`.

| Field | Meaning |
|-------|---------|
| `timestamp` | Absolute Unix seconds (AI Test: `base_unix_ts + video_timestamp_sec`) |
| `video_timestamp_sec` | Media-relative seconds from video start |
| `frame_index` | 0-based source frame ordinal (Event Media seeking) |
| `bbox` | `[x1,y1,x2,y2]` full **original frame** pixels |
| `track_id` | Integer identity within camera/run — not persistent real-world ID |
| `class` | VisionLayer canonical name only |
| `source` | `mock` \| `dev` \| `development_video` \| `deepstream` \| `hailo` |

## Class mapping SSOT

| Layer | Source |
|-------|--------|
| Product object types / vehicle group | `edge-api/app/domain/vision_capabilities.py` |
| Frontend mirror | `apps/web/src/lib/vision-capabilities.ts` |
| Detector ID → canonical | `services/vision/class_mapping.py` (vision-only) |

`vehicle` → `{car, truck, bus, motorcycle}` — **bicycle excluded**.

## Spatial engine ownership

Custom VisionLayer spatial (zones, lines, dwell, occupancy) remains the Product spatial truth.  
DeepStream `nvdsanalytics` is **out of scope** for v1 NVIDIA integration.

## Event Media boundary (current vs future)

### Current (implemented)

- Source is a **seekable MP4** (`VideoLabAsset.stored_path`)
- Snapshot: OpenCV seek by `frame_index` / timestamp + draw `bbox`
- Clip: FFmpeg (preferred) / OpenCV fallback
- Needs from Detection/Event: `timestamp`, `video_timestamp_sec`, `frame_index`, `bbox`, `track_id`, source video path

### Future live RTSP (documented only — not implemented)

- Source may be continuous RTSP
- Event Media will require a **recording / ring-buffer / segment store**
- DeepStream adapter must still preserve Detection fields above so media can attach to recorded segments
- No NVENC / ring buffer in this cleanup sprint

## Event run isolation

`Event.source_analysis_run_id` is stamped **at Event creation** inside `DetectionPipeline` when `analysis_run_id` is passed (AI Test). Event Media must not be the sole owner of run identity.

Camera Events and global Events both scope via **latest successful run** (`benchmark_store.latest_successful_run_*` / `GET /video-lab/latest-successful-runs`).
