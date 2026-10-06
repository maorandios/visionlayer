"""Centralized Vision / Video Lab runtime performance settings (env-configurable)."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from functools import lru_cache


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True, slots=True)
class VisionRuntimeConfig:
    """Conservative development defaults — protect the host CPU."""

    # ONNX Runtime
    onnx_intra_op_num_threads: int = 4
    onnx_inter_op_num_threads: int = 1
    # OpenCV
    opencv_num_threads: int = 2
    # Detector schedule: analyze every Nth frame (1 = all frames)
    frame_stride: int = 3
    # Preferred model basename (without path): yolox_s | yolox_m | yolox_tiny | yolox_nano
    preferred_model: str = "yolox_s"

    def to_dict(self) -> dict:
        return asdict(self)


@lru_cache(maxsize=1)
def get_vision_runtime_config() -> VisionRuntimeConfig:
    return VisionRuntimeConfig(
        onnx_intra_op_num_threads=max(1, _int_env("VISION_ONNX_INTRA_OP_THREADS", 4)),
        onnx_inter_op_num_threads=max(1, _int_env("VISION_ONNX_INTER_OP_THREADS", 1)),
        opencv_num_threads=max(0, _int_env("VISION_OPENCV_NUM_THREADS", 2)),
        frame_stride=max(1, _int_env("VISION_FRAME_STRIDE", 3)),
        preferred_model=(os.getenv("VISION_YOLOX_MODEL") or "yolox_s").strip().lower().removesuffix(".onnx"),
    )


def clear_vision_runtime_config_cache() -> None:
    get_vision_runtime_config.cache_clear()


def apply_opencv_thread_limit(cfg: VisionRuntimeConfig | None = None) -> None:
    cfg = cfg or get_vision_runtime_config()
    try:
        import cv2

        cv2.setNumThreads(int(cfg.opencv_num_threads))
    except Exception:
        pass


MODEL_PRIORITY = ("yolox_m", "yolox_s", "yolox_tiny", "yolox_nano")


def resolve_model_order(preferred: str | None = None) -> tuple[str, ...]:
    """Return ONNX filenames in preference order (preferred first, then remaining)."""
    pref = (preferred or get_vision_runtime_config().preferred_model).lower().removesuffix(".onnx")
    names = [f"{pref}.onnx"]
    for base in MODEL_PRIORITY:
        fname = f"{base}.onnx"
        if fname not in names:
            names.append(fname)
    return tuple(names)
