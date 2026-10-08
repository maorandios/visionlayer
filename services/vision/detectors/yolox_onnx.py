"""Development detector using ONNX Runtime + YOLOX (Apache-2.0).

Product Layer must never import this module.

Important: Megvii YOLOX ONNX exports emit *raw* head outputs that require
grid/stride decoding (demo_postprocess) before boxes are usable.
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

from detectors.base import RawDetection

logger = logging.getLogger(__name__)

# COCO 80-class names (YOLOX / standard COCO)
COCO_NAMES = (
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
)

PRIMARY_CLASSES = frozenset({"person", "car", "truck", "bus", "bicycle", "motorcycle"})

# Higher floor cuts false bicycle/motorcycle on legs/floor; person stays usable at 0.40.
DEFAULT_CONF = 0.40
DEFAULT_NMS = 0.45
DEFAULT_SCORE = 0.40
# Only collapse look-alike classes (bike ↔ moto), not person↔bike (real push-bike overlap).
CONFUSED_CLASS_GROUPS = (frozenset({"bicycle", "motorcycle"}),)
CLASS_CONF = {
    "person": 0.40,
    "bicycle": 0.45,
    "motorcycle": 0.50,
    "car": 0.40,
    "truck": 0.40,
    "bus": 0.40,
}


class YoloxOnnxDetector:
    """YOLOX ONNX detector with correct Megvii grid decoding."""

    def __init__(
        self,
        model_path: Path | str | None = None,
        *,
        input_size: tuple[int, int] = (416, 416),
        conf_threshold: float = DEFAULT_CONF,
        nms_threshold: float = DEFAULT_NMS,
        score_threshold: float = DEFAULT_SCORE,
        with_p6: bool = False,
        class_filter: frozenset[str] | None = None,
        # When True, ignore per-class CLASS_CONF floors (debug / correctness mode).
        uniform_threshold: bool = False,
    ) -> None:
        self._input_size = input_size
        self._conf = conf_threshold
        self._nms = nms_threshold
        self._score = score_threshold
        self._with_p6 = with_p6
        self._uniform_threshold = bool(uniform_threshold)
        filt = class_filter if class_filter is not None else PRIMARY_CLASSES
        self._class_filter = frozenset(c for c in filt if c in PRIMARY_CLASSES) or PRIMARY_CLASSES
        self._session = None
        self._model_path = Path(model_path) if model_path else _default_model_path()
        self._load()

    @property
    def name(self) -> str:
        return "yolox_onnx"

    @property
    def supported_classes(self) -> tuple[str, ...]:
        return tuple(sorted(self._class_filter))

    @property
    def model_path(self) -> Path:
        return self._model_path

    def _load(self) -> None:
        if not self._model_path.is_file():
            raise FileNotFoundError(
                f"ONNX model missing at {self._model_path}. "
                "Run scripts/download-dev-model.py"
            )
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        try:
            from runtime_config import get_vision_runtime_config

            rt = get_vision_runtime_config()
            opts.intra_op_num_threads = int(rt.onnx_intra_op_num_threads)
            opts.inter_op_num_threads = int(rt.onnx_inter_op_num_threads)
            logger.info(
                "onnx_threads intra=%s inter=%s",
                opts.intra_op_num_threads,
                opts.inter_op_num_threads,
            )
        except Exception:
            opts.intra_op_num_threads = 4
            opts.inter_op_num_threads = 1
        self._session = ort.InferenceSession(
            str(self._model_path),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        # Prefer model input HW when available
        shape = self._session.get_inputs()[0].shape
        if len(shape) == 4 and all(isinstance(x, int) for x in shape[2:]):
            self._input_size = (int(shape[2]), int(shape[3]))
        logger.info(
            "loaded_onnx_model path=%s input=%s classes=%s",
            self._model_path,
            self._input_size,
            sorted(self._class_filter),
        )

    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        assert self._session is not None
        img, ratio = _preprocess(image_bgr, self._input_size)
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: img})
        predictions = demo_postprocess(outputs[0], self._input_size, p6=self._with_p6)
        return _postprocess(
            predictions,
            ratio=ratio,
            conf_threshold=self._conf,
            nms_threshold=self._nms,
            score_threshold=self._score,
            class_filter=self._class_filter,
            uniform_threshold=self._uniform_threshold,
        )


class ScriptedDetector:
    """Deterministic detector for automated tests — no ONNX required.

    Detects a green rectangle painted by MockSource as `person`.
    """

    @property
    def name(self) -> str:
        return "scripted_test_detector"

    @property
    def supported_classes(self) -> tuple[str, ...]:
        return ("person", "car", "truck", "bus", "bicycle", "motorcycle")

    def detect(self, image_bgr: np.ndarray) -> list[RawDetection]:
        mask = cv2.inRange(image_bgr, (0, 200, 0), (40, 255, 40))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        out: list[RawDetection] = []
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            if w * h < 200:
                continue
            out.append(
                RawDetection(
                    class_name="person",
                    confidence=0.95,
                    bbox=(float(x), float(y), float(x + w), float(y + h)),
                )
            )
        return out


def _default_model_path() -> Path:
    root = Path(__file__).resolve().parents[3]
    models = root / "data" / "models"
    try:
        from runtime_config import resolve_model_order

        order = resolve_model_order()
    except Exception:
        order = ("yolox_s.onnx", "yolox_m.onnx", "yolox_tiny.onnx", "yolox_nano.onnx")
    for name in order:
        candidate = models / name
        if candidate.is_file():
            return candidate
    return models / "yolox_nano.onnx"


def _preprocess(image_bgr: np.ndarray, input_size: tuple[int, int]) -> tuple[np.ndarray, float]:
    """Letterbox resize to input_size, return NCHW float32 and scale ratio."""
    ih, iw = input_size
    h, w = image_bgr.shape[:2]
    ratio = min(iw / w, ih / h)
    nw, nh = int(round(w * ratio)), int(round(h * ratio))
    resized = cv2.resize(image_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((ih, iw, 3), 114, dtype=np.uint8)
    canvas[:nh, :nw] = resized
    rgb = canvas[:, :, ::-1].astype(np.float32)
    chw = np.transpose(rgb, (2, 0, 1))[None, ...]
    return chw, ratio


def demo_postprocess(outputs: np.ndarray, img_size: tuple[int, int], p6: bool = False) -> np.ndarray:
    """Decode YOLOX raw ONNX outputs into cxcywh in letterbox pixel space.

    Port of Megvii YOLOX `yolox.utils.demo_postprocess`.
    """
    grids = []
    expanded_strides = []
    strides = [8, 16, 32] if not p6 else [8, 16, 32, 64]

    hsizes = [img_size[0] // stride for stride in strides]
    wsizes = [img_size[1] // stride for stride in strides]

    for hsize, wsize, stride in zip(hsizes, wsizes, strides, strict=True):
        xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
        grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(grid)
        shape = grid.shape[:2]
        expanded_strides.append(np.full((*shape, 1), stride))

    grids_arr = np.concatenate(grids, 1).astype(np.float32)
    strides_arr = np.concatenate(expanded_strides, 1).astype(np.float32)

    outputs = outputs.copy()
    if outputs.ndim == 2:
        outputs = outputs[None, ...]

    outputs[..., :2] = (outputs[..., :2] + grids_arr) * strides_arr
    outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * strides_arr
    return outputs


def _postprocess(
    predictions: np.ndarray,
    *,
    ratio: float,
    conf_threshold: float,
    nms_threshold: float,
    score_threshold: float,
    class_filter: frozenset[str],
    uniform_threshold: bool = False,
) -> list[RawDetection]:
    """Decode YOLOX decoded output [1, N, 85] or [N, 85] (cx,cy,w,h,obj,cls...)."""
    preds = predictions
    if preds.ndim == 3:
        preds = preds[0]
    if preds.size == 0:
        return []

    boxes = preds[:, :4]
    obj = preds[:, 4:5]
    cls_scores = preds[:, 5:]
    scores = obj * cls_scores

    # Per-class NMS first, then cross-class NMS so a strong person box
    # suppresses a weak overlapping bicycle/motorcycle false positive.
    final: list[RawDetection] = []
    for class_id, name in enumerate(COCO_NAMES):
        if name not in class_filter:
            continue
        if uniform_threshold:
            class_floor = max(conf_threshold, score_threshold)
        else:
            class_floor = max(conf_threshold, score_threshold, CLASS_CONF.get(name, conf_threshold))
        class_conf = scores[:, class_id]
        keep = np.where(class_conf >= class_floor)[0]
        if keep.size == 0:
            continue
        b = boxes[keep]
        c = class_conf[keep]
        xyxy = np.zeros_like(b)
        xyxy[:, 0] = b[:, 0] - b[:, 2] / 2
        xyxy[:, 1] = b[:, 1] - b[:, 3] / 2
        xyxy[:, 2] = b[:, 0] + b[:, 2] / 2
        xyxy[:, 3] = b[:, 1] + b[:, 3] / 2
        xyxy /= max(ratio, 1e-6)
        order = _nms(xyxy, c, nms_threshold)
        for j in order:
            x1, y1, x2, y2 = xyxy[j].tolist()
            if x2 - x1 < 4 or y2 - y1 < 4:
                continue
            final.append(
                RawDetection(
                    class_name=name,
                    confidence=float(c[j]),
                    bbox=(float(x1), float(y1), float(x2), float(y2)),
                )
            )
    return _collapse_confused_classes(final, iou_thr=0.45)


def _collapse_confused_classes(
    dets: list[RawDetection], *, iou_thr: float
) -> list[RawDetection]:
    """Keep the highest-confidence label within look-alike groups (bike/moto)."""
    if len(dets) <= 1:
        return dets
    suppressed = [False] * len(dets)
    for group in CONFUSED_CLASS_GROUPS:
        idxs = [i for i, d in enumerate(dets) if d.class_name in group]
        for a in idxs:
            if suppressed[a]:
                continue
            for b in idxs:
                if a == b or suppressed[b]:
                    continue
                if _iou_xyxy(dets[a].bbox, dets[b].bbox) < iou_thr:
                    continue
                # Prefer higher confidence; tie-break toward bicycle over motorcycle.
                prefer_a = (dets[a].confidence, dets[a].class_name == "bicycle") >= (
                    dets[b].confidence,
                    dets[b].class_name == "bicycle",
                )
                if prefer_a:
                    suppressed[b] = True
                else:
                    suppressed[a] = True
                    break
    return [d for i, d in enumerate(dets) if not suppressed[i]]


def _iou_xyxy(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _nms(boxes: np.ndarray, scores: np.ndarray, thr: float) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(iou <= thr)[0]
        order = order[inds + 1]
    return keep
