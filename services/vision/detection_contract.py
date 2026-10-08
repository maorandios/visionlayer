"""Authoritative Unified Detection contract helpers.

Product Layer and all vision backends must emit/consume detections matching
``shared/schemas/detection.schema.json``.

Semantics (enforced by builders + tests)
---------------------------------------
timestamp
  Absolute Unix time (seconds, fractional OK) used for Rule schedule and Event
  ``started_at``. For AI Test: ``base_unix_ts + video_timestamp_sec`` where
  ``base_unix_ts`` is ``test_start_datetime`` when configured, else analysis base.

video_timestamp_sec
  Seconds from the start of the source video (0-based). Always relative to the
  media timeline — never wall clock.

frame_index
  0-based frame ordinal in the source video (after any decode stride selection
  the backend chooses to report). Required for Event Media seeking on file sources.

bbox
  Pixel ``[x1, y1, x2, y2]`` in the **full original frame** coordinate space
  (not letterboxed/network-input space). DeepStream adapters must map back.

track_id
  Integer identity within the current camera stream/run while the tracker
  maintains association. Not a persistent real-world identity; may break after
  long occlusion. Product Logic must not assume ByteTrack-specific behavior.

source
  Backend identity: ``mock`` | ``dev`` | ``development_video`` | ``deepstream`` | ``hailo``.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import Any

DETECTION_SCHEMA_VERSION = "1.0"
DETECTION_TYPE = "detection"

ALLOWED_SOURCES = frozenset({"mock", "dev", "development_video", "deepstream", "hailo"})

# VisionLayer canonical detector class names (product-facing).
CANONICAL_CLASSES = frozenset({"person", "car", "truck", "bus", "motorcycle", "bicycle"})


class DetectionContractError(ValueError):
    """Raised when a payload violates the Unified Detection contract."""


def build_detection(
    *,
    camera_id: str,
    class_name: str,
    confidence: float,
    bbox: Collection[float],
    timestamp: float,
    source: str,
    track_id: int | None = None,
    frame_size: Collection[int] | None = None,
    frame_index: int | None = None,
    video_timestamp_sec: float | None = None,
) -> dict[str, Any]:
    """Build a Detection dict and validate it."""
    box = [float(x) for x in bbox]
    payload: dict[str, Any] = {
        "type": DETECTION_TYPE,
        "schema_version": DETECTION_SCHEMA_VERSION,
        "camera_id": str(camera_id),
        "class": str(class_name),
        "confidence": float(confidence),
        "bbox": box,
        "timestamp": float(timestamp),
        "source": str(source),
    }
    if track_id is not None:
        payload["track_id"] = int(track_id)
    if frame_size is not None:
        payload["frame_size"] = [int(frame_size[0]), int(frame_size[1])]
    if frame_index is not None:
        payload["frame_index"] = int(frame_index)
    if video_timestamp_sec is not None:
        payload["video_timestamp_sec"] = float(video_timestamp_sec)
    validate_detection(payload)
    return payload


def validate_detection(payload: Mapping[str, Any]) -> None:
    """Fail fast on invalid Detection objects at the Vision boundary."""
    if not isinstance(payload, Mapping):
        raise DetectionContractError("detection must be an object")
    for key in (
        "type",
        "schema_version",
        "camera_id",
        "class",
        "confidence",
        "bbox",
        "timestamp",
        "source",
    ):
        if key not in payload:
            raise DetectionContractError(f"missing required field: {key}")
    if payload["type"] != DETECTION_TYPE:
        raise DetectionContractError("type must be 'detection'")
    if payload["schema_version"] != DETECTION_SCHEMA_VERSION:
        raise DetectionContractError(f"unsupported schema_version: {payload['schema_version']}")
    if not str(payload["camera_id"]).strip():
        raise DetectionContractError("camera_id must be non-empty")
    cls = str(payload["class"]).strip()
    if not cls:
        raise DetectionContractError("class must be non-empty")
    # Product expects VisionLayer canonical names; adapters must map before emit.
    if cls not in CANONICAL_CLASSES:
        raise DetectionContractError(
            f"class '{cls}' is not a VisionLayer canonical class; map native labels in the vision backend"
        )
    conf = float(payload["confidence"])
    if conf < 0.0 or conf > 1.0:
        raise DetectionContractError("confidence must be in [0, 1]")
    bbox = payload["bbox"]
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        raise DetectionContractError("bbox must be [x1, y1, x2, y2] in full-frame pixels")
    try:
        x1, y1, x2, y2 = (float(v) for v in bbox)
    except (TypeError, ValueError) as exc:
        raise DetectionContractError("bbox values must be numbers") from exc
    if x2 < x1 or y2 < y1:
        raise DetectionContractError("bbox must satisfy x2>=x1 and y2>=y1")
    source = str(payload["source"])
    if source not in ALLOWED_SOURCES:
        raise DetectionContractError(f"unsupported source: {source}")
    if "track_id" in payload and payload["track_id"] is not None:
        tid = int(payload["track_id"])
        if tid < 0:
            raise DetectionContractError("track_id must be >= 0")
    if "frame_size" in payload and payload["frame_size"] is not None:
        fs = payload["frame_size"]
        if not isinstance(fs, (list, tuple)) or len(fs) != 2:
            raise DetectionContractError("frame_size must be [width, height]")
        if int(fs[0]) < 1 or int(fs[1]) < 1:
            raise DetectionContractError("frame_size dimensions must be >= 1")
    if (
        "frame_index" in payload
        and payload["frame_index"] is not None
        and int(payload["frame_index"]) < 0
    ):
        raise DetectionContractError("frame_index must be >= 0")
    if (
        "video_timestamp_sec" in payload
        and payload["video_timestamp_sec"] is not None
        and float(payload["video_timestamp_sec"]) < 0
    ):
        raise DetectionContractError("video_timestamp_sec must be >= 0")


def validate_detections(payloads: Collection[Mapping[str, Any]]) -> None:
    for i, p in enumerate(payloads):
        try:
            validate_detection(p)
        except DetectionContractError as exc:
            raise DetectionContractError(f"detections[{i}]: {exc}") from exc
