"""Shared ID helpers."""

from __future__ import annotations

import re
import uuid

_SLUG_RE = re.compile(r"[^a-z0-9_-]+")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(value: str, *, fallback: str = "item") -> str:
    cleaned = value.strip().lower().replace(" ", "-")
    cleaned = _SLUG_RE.sub("", cleaned)
    return cleaned or fallback
