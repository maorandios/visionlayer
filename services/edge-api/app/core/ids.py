"""Shared ID helpers."""

from __future__ import annotations

import re
import uuid

_SLUG_RE = re.compile(r"[^a-z0-9_-]+")
_DASHES_RE = re.compile(r"-{2,}")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(value: str, *, fallback: str = "item") -> str:
    cleaned = value.strip().lower().replace(" ", "-")
    cleaned = _SLUG_RE.sub("", cleaned)
    cleaned = _DASHES_RE.sub("-", cleaned).strip("-_")
    # Hebrew (or any non-ASCII) names leave nothing meaningful behind → use the fallback.
    if not re.search(r"[a-z]", cleaned):
        return fallback
    return cleaned


def id_from_name(prefix: str, name: str) -> str:
    """Readable id for ASCII names (``rule_front-gate``), random id otherwise (``rule_3f9c…``)."""
    slug = slugify(name, fallback="")
    return f"{prefix}_{slug}" if slug else new_id(prefix)
