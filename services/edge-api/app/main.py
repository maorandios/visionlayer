"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure models are registered on Base.metadata
import app.adapters.models
from app.adapters.db import get_engine, get_session_factory
from app.adapters.models import Event
from app.api.auth import router as auth_router
from app.api.cameras import router as cameras_router
from app.api.event_broadcast import broadcast_event_created
from app.api.event_broadcast import router as ws_router
from app.api.event_serializers import event_to_payload
from app.api.events import router as events_router
from app.api.health import router as health_router
from app.api.rules import router as rules_router
from app.api.simulate import router as simulate_router
from app.api.video_lab import router as video_lab_router
from app.api.zones import router as zones_router
from app.bus.event_bus import bus
from app.core.bootstrap import ensure_bootstrap
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.domain.pipeline.detection_pipeline import TOPIC_DETECTIONS, DetectionPipeline
from app.domain.rules.tracker import ZonePresenceTracker


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    if settings.database_url.startswith("sqlite"):
        db_path = settings.database_url.split("///")[-1]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # Ensure schema exists (Alembic remains the migration source of truth)
    from app.adapters.db import Base

    engine = get_engine()
    session_factory = get_session_factory()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    tracker = ZonePresenceTracker()
    pipeline = DetectionPipeline(session_factory, tracker=tracker)
    app.state.detection_pipeline = pipeline
    app.state.zone_tracker = tracker
    app.state.last_batch_event_ids = []

    # Reset global bus handlers to avoid duplicate subscriptions across reloads/tests
    bus._handlers.clear()

    async def on_detection(_topic: str, payload: Any) -> None:
        ids = await pipeline.handle(_topic, payload)
        app.state.last_batch_event_ids = ids
        if ids:
            async with session_factory() as session:
                for event_id in ids:
                    row = await session.get(Event, event_id)
                    if row is not None:
                        await broadcast_event_created(event_to_payload(row))

    bus.subscribe(TOPIC_DETECTIONS, on_detection)

    async with session_factory() as session:
        await ensure_bootstrap(session)

    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    register_exception_handlers(app)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(ws_router)
    app.include_router(auth_router)
    app.include_router(cameras_router)
    app.include_router(zones_router)
    app.include_router(rules_router)
    app.include_router(events_router)
    app.include_router(simulate_router)
    app.include_router(video_lab_router)

    @app.get("/")
    async def root() -> dict:
        info = settings.public_info()
        info["version"] = "0.1.0"
        info["phase"] = "video-lab"
        return info

    return app


app = create_app()
