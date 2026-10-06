"""WebSocket broadcast for new events (Phase 2 UI realtime)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.errors import AppError
from app.core.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class EventConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except (RuntimeError, ConnectionError, OSError):
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)


event_connections = EventConnectionManager()


@router.websocket("/ws/events")
async def websocket_events(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decode_access_token(token)
    except AppError:
        await websocket.close(code=4401)
        return

    await event_connections.connect(websocket)
    try:
        while True:
            # Client may send ping; ignore payload
            await websocket.receive_text()
    except WebSocketDisconnect:
        await event_connections.disconnect(websocket)
    except RuntimeError:
        await event_connections.disconnect(websocket)
        logger.debug("websocket_events_closed")


async def broadcast_event_created(event_payload: dict[str, Any]) -> None:
    await event_connections.broadcast({"type": "event.created", "event": event_payload})
