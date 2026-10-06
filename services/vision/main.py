"""Vision process entrypoint placeholder.

Phase 0: loads mock adapter and reports health. Real streaming starts Phase 4.
"""

from __future__ import annotations

import asyncio
import logging

from adapters import AdapterRegistry, MockVisionAdapter
from publisher import DetectionPublisher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("vision")


def build_registry() -> AdapterRegistry:
    registry = AdapterRegistry()
    registry.register("mock", MockVisionAdapter)
    return registry


async def main() -> None:
    registry = build_registry()
    adapter = registry.create("mock")
    publisher = DetectionPublisher()

    async def on_detection(detection: dict) -> None:
        await publisher.publish(detection)

    await adapter.start(cameras=[], on_detection=on_detection)
    health = await adapter.health()
    caps = adapter.capabilities()
    logger.info(
        "vision_process_ready adapter=%s healthy=%s caps=%s",
        health.adapter.value,
        health.healthy,
        list(caps.capabilities),
    )
    await adapter.stop()


if __name__ == "__main__":
    asyncio.run(main())
