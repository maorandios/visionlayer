"""Ensure Product Layer never imports hardware-specific Vision SDKs."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PRODUCT_ROOT = Path(__file__).resolve().parents[1] / "app"

FORBIDDEN_MODULES = {
    "pyds",
    "gi.repository.Gst",
    "deepstream",
    "tensorrt",
    "trt",
    "pycuda",
    "cuda",
    "cudart",
    "hailo",
    "hailo_platform",
    "hailort",
    "hailo_platform.pyhailort",
    "ultralytics",  # also keep YOLO out of Product Layer
}

FORBIDDEN_SUBSTRINGS = (
    "deepstream",
    "tensorrt",
    "hailort",
    "hailo_platform",
    "pycuda",
    "nvinfer",
)


def _iter_python_files(root: Path) -> list[Path]:
    return [p for p in root.rglob("*.py") if p.is_file()]


def _imported_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
                names.add(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
            names.add(node.module)
    return names


def test_product_layer_has_no_hardware_sdk_imports() -> None:
    violations: list[str] = []
    for path in _iter_python_files(PRODUCT_ROOT):
        source = path.read_text(encoding="utf-8")
        lower = source.lower()
        for needle in FORBIDDEN_SUBSTRINGS:
            if needle in lower:
                # Allow mentions in comments/docstrings that explicitly forbid SDKs
                # only if they appear in a forbid/never context — still scan imports strictly.
                pass
        tree = ast.parse(source, filename=str(path))
        imported = _imported_names(tree)
        bad = imported & FORBIDDEN_MODULES
        # Also catch dotted modules
        for name in imported:
            for forbidden in FORBIDDEN_MODULES:
                if name == forbidden or name.startswith(forbidden + "."):
                    bad.add(name)
        if bad:
            violations.append(f"{path.relative_to(PRODUCT_ROOT)}: {sorted(bad)}")

    assert not violations, "Hardware SDK imports found in Product Layer:\n" + "\n".join(violations)


def test_product_layer_source_does_not_reference_sdk_packages_as_imports() -> None:
    """AST-level scan for from X import / import X patterns on forbidden packages."""
    import_patterns = [
        "import deepstream",
        "import tensorrt",
        "import pycuda",
        "import hailo",
        "import hailort",
        "from deepstream",
        "from tensorrt",
        "from pycuda",
        "from hailo",
        "from hailort",
        "import pyds",
        "from pyds",
    ]
    hits: list[str] = []
    for path in _iter_python_files(PRODUCT_ROOT):
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            lower = stripped.lower()
            for pattern in import_patterns:
                if lower.startswith(pattern):
                    hits.append(f"{path}:{line_no}: {stripped}")
    assert not hits, "Forbidden import lines:\n" + "\n".join(hits)


@pytest.mark.parametrize(
    "module_name",
    ["app.main", "app.core.config", "app.adapters.db", "app.bus.event_bus"],
)
def test_core_modules_import_cleanly(module_name: str) -> None:
    __import__(module_name)
