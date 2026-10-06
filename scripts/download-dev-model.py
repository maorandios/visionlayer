"""Download YOLOX ONNX models for Video Test Lab (Apache-2.0).

Prefers YOLOX-S for better bicycle/small-object recall. Nano remains a lightweight fallback.
Models are NOT committed to git.
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

MODELS = {
    "yolox_m.onnx": [
        "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_m.onnx",
    ],
    "yolox_s.onnx": [
        "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx",
        "https://huggingface.co/Heliosoph/yolox-onnx/resolve/main/yolox_s.onnx",
    ],
    "yolox_nano.onnx": [
        "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx",
        "https://huggingface.co/Heliosoph/yolox-onnx/resolve/main/yolox_nano.onnx",
    ],
}


def _download(name: str, urls: list[str], out: Path) -> bool:
    if out.is_file() and out.stat().st_size > 1_000_000:
        print(f"Already present: {out}")
        return True
    for url in urls:
        try:
            print(f"Downloading {url}")
            urllib.request.urlretrieve(url, out)
            print(f"Saved {out} ({out.stat().st_size} bytes)")
            return True
        except Exception as exc:
            print(f"Failed: {exc}")
    return False


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    models_dir = root / "data" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    ok = True
    for name, urls in MODELS.items():
        if not _download(name, urls, models_dir / name):
            ok = False
    if not ok:
        print("Could not download all models. Analysis may fall back to scripted detector.")
        return 1
    print("Preferred runtime model: yolox_m.onnx → yolox_s.onnx → nano.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
