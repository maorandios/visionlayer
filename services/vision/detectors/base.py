"""Detector adapter contracts — vendor-agnostic raw boxes before schema mapping."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np


@dataclass(frozen=True, slots=True)
class RawDetection:
    class_name: str
    confidence: float
    # pixel xyxy
    bbox: tuple[float, float, float, float]


@runtime_checkable
class ObjectDetector(Protocol):
    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]: ...

    @property
    def name(self) -> str: ...

    @property
    def supported_classes(self) -> tuple[str, ...]: ...
