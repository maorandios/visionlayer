"""VisionAdapter protocol smoke tests."""

from __future__ import annotations

import pytest

from adapters.base import VisionAdapter
from adapters.mock import MockVisionAdapter


@pytest.mark.asyncio
async def test_mock_adapter_satisfies_protocol() -> None:
    adapter = MockVisionAdapter()
    assert isinstance(adapter, VisionAdapter)

    received: list[dict] = []

    async def on_detection(det: dict) -> None:
        received.append(det)

    await adapter.start(cameras=[], on_detection=on_detection)
    health = await adapter.health()
    assert health.healthy is True
    caps = adapter.capabilities()
    assert caps.adapter.value == "mock"
    assert "detection" in caps.capabilities
    await adapter.stop()
