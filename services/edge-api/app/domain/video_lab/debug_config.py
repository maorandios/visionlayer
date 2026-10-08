"""AI Test correctness / debug run configuration (separate from production runtime)."""

from __future__ import annotations

DEBUG_FRAME_STRIDE = 1
DEBUG_CONF_THRESHOLD = 0.25
DEBUG_SCORE_THRESHOLD = 0.25

DEBUG_DETECTOR_CONFIDENCE = {
    "conf_threshold": DEBUG_CONF_THRESHOLD,
    "nms_threshold": 0.45,
    "score_threshold": DEBUG_SCORE_THRESHOLD,
    "uniform_threshold": True,
    "class_floors": {
        "person": DEBUG_CONF_THRESHOLD,
        "bicycle": DEBUG_CONF_THRESHOLD,
        "motorcycle": DEBUG_CONF_THRESHOLD,
        "car": DEBUG_CONF_THRESHOLD,
        "bus": DEBUG_CONF_THRESHOLD,
        "truck": DEBUG_CONF_THRESHOLD,
    },
}

DEBUG_SEARCH_CLASSES = sorted(
    {"person", "car", "truck", "bus", "motorcycle", "bicycle"}
)
