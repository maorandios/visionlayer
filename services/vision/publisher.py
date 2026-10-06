"""Publishes unified detection payloads to the Product Layer bus/API.

Phase 0: placeholder only — no network wiring yet.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class DetectionPublisher:
    """Receives detection dicts from a VisionAdapter and forwards them upstream."""

    async def publish(self, detection: dict[str, Any]) -> None:
        logger.debug("detection_publish_stub", extra={"camera_id": detection.get("camera_id")})
