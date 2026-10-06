# Video Lab Benchmark Run — metric definitions

## Tables

- `video_analysis_runs` — one immutable Benchmark Run per analysis job (never overwritten; re-analyzing creates a new job/run)
- `video_analysis_track_reviews` — manual review per `(run_id, track_id)`

Migration: `alembic/versions/0004_video_lab_benchmark.py`  
(Dev SQLite also creates tables via `Base.metadata.create_all` on API startup.)

## Formulas

| Metric | Formula / definition |
|--------|----------------------|
| `detections_total` | Count of accepted detector outputs after conf/NMS across analyzed frames |
| `unique_tracks_total` | Count of distinct ByteTrack `track_id` values |
| `events_total` | Count of persisted VisionLayer Events created in this run |
| `false_positive_rate` | `false_positive_tracks / reviewed_tracks` — **null** if `reviewed_tracks == 0` (UI: «טרם נבדק», never `0%`) |
| `analysis_time_seconds` | Wall-clock from analysis start through gallery generation |
| `processing_fps` | `video_frames_total / analysis_time_seconds` |

Also stored: `video_frames_total`, `detector_frames_analyzed`, `detector_calls`, `frame_stride`, `source_video_fps`, detector model, tracker, confidence config, per-class breakdowns.

Code source of truth: `app/domain/video_lab/benchmark.py`

## UI summary cards

```text
זיהויים | אובייקטים ייחודיים | אירועים | False Positives | זמן ניתוח | קצב עיבוד
```

Gallery track cards: נכון / שגוי / לא נבדק → updates FP metrics immediately without re-analysis.
History list reopens a stored run (no automatic re-run).
