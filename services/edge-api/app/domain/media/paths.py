"""Safe paths for on-disk event media."""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings


def event_media_root() -> Path:
    root = Path(get_settings().event_media_dir)
    if not root.is_absolute():
        edge_api = Path(__file__).resolve().parents[3]
        root = (edge_api / root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def event_media_dir(event_id: str) -> Path:
    safe = event_id.replace("/", "_").replace("\\", "_")
    return event_media_root() / safe


def snapshot_file(event_id: str) -> Path:
    return event_media_dir(event_id) / "snapshot.jpg"


def clip_file(event_id: str) -> Path:
    return event_media_dir(event_id) / "clip.mp4"


def relative_media_path(event_id: str, filename: str) -> str:
    safe = event_id.replace("/", "_").replace("\\", "_")
    return f"{safe}/{filename}"


def resolve_stored_media(stored: str | None) -> Path | None:
    if not stored:
        return None
    p = Path(stored)
    if p.is_absolute():
        candidate = p.resolve()
    else:
        candidate = (event_media_root() / stored).resolve()
    root = event_media_root().resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None
