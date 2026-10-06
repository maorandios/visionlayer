"""Event bus abstraction — in-process for MVP; MQTT-swappable later."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

Handler = Callable[[str, Any], Awaitable[None]]


class EventBus(Protocol):
    async def publish(self, topic: str, payload: Any) -> None: ...

    def subscribe(self, topic: str, handler: Handler) -> None: ...


class InProcessEventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)

    async def publish(self, topic: str, payload: Any) -> None:
        for handler in list(self._handlers.get(topic, [])):
            await handler(topic, payload)
        for handler in list(self._handlers.get("*", [])):
            await handler(topic, payload)


bus = InProcessEventBus()
