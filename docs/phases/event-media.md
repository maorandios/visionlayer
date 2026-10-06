# Basic Event Media

Events from Video Lab analysis receive local visual evidence after rule evaluation completes (no second YOLOX pass).

## Storage layout

```text
data/event-media/
└── {event_id}/
    ├── snapshot.jpg
    └── clip.mp4
```

Paths are stored in SQLite as relative keys (`{event_id}/snapshot.jpg`). Binary files are never stored in the DB.

## Clip window

- **Before trigger:** 1.3 s (`CLIP_PRE_SEC`)
- **After trigger:** 1.5 s (`CLIP_POST_SEC`)

Extraction order:

1. System `ffmpeg` on PATH (if installed)
2. Bundled `imageio-ffmpeg` binary (H.264 / yuv420p / +faststart — browser-playable)
3. OpenCV `VideoWriter` last resort (often not playable in Chrome)


## Representative snapshot

Uses the same scoring weights as `vision/pipeline/track_results.py`, plus proximity to the rule trigger time on the video timeline (`video_timestamp_sec` / detection timestamp − `base_unix_ts`).

One bounding box — the triggering `track_id` only.

## Retention (future)

Configure `VL_EVENT_MEDIA_RETENTION_DAYS` (optional). No automatic cleanup job yet; a future task will delete `data/event-media/*` older than the retention window and clear DB paths.

## API

- `GET /api/v1/events/{id}/snapshot` — JPEG
- `GET /api/v1/events/{id}/clip` — MP4

## Failure behavior

`media_status`: `none` | `unavailable` | `snapshot_only` | `complete` | `failed`

Event rows are always kept; snapshot and clip failures are logged and surfaced in UI fallbacks.
