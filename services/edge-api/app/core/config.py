"""Centralized settings loaded from environment and shared feature flags."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_shared_root() -> Path:
    """Resolve shared/ for local monorepo or Docker (/shared)."""
    env_root = os.getenv("VL_SHARED_ROOT")
    if env_root:
        return Path(env_root)
    # services/edge-api/app/core/config.py -> parents[4] = repo root
    monorepo_shared = Path(__file__).resolve().parents[4] / "shared"
    if monorepo_shared.exists():
        return monorepo_shared
    docker_shared = Path("/shared")
    if docker_shared.exists():
        return docker_shared
    return monorepo_shared


SHARED_ROOT = _default_shared_root()
FEATURES_PATH = SHARED_ROOT / "config" / "features.yaml"
SCHEMAS_DIR = SHARED_ROOT / "schemas"


def _load_feature_defaults() -> dict[str, bool]:
    if not FEATURES_PATH.exists():
        return {}
    raw = yaml.safe_load(FEATURES_PATH.read_text(encoding="utf-8")) or {}
    features = raw.get("features", {})
    return {str(k): bool(v) for k, v in features.items()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VisionLayer Edge API"
    app_version: str = "0.1.0"
    environment: str = Field(default="development", alias="VL_ENV")
    debug: bool = Field(default=False, alias="VL_DEBUG")
    log_level: str = Field(default="INFO", alias="VL_LOG_LEVEL")

    host: str = Field(default="0.0.0.0", alias="VL_HOST")
    port: int = Field(default=8000, alias="VL_PORT")

    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/visionlayer.db",
        alias="DATABASE_URL",
    )

    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="VL_CORS_ORIGINS",
    )

    jwt_secret: str = Field(default="visionlayer-dev-secret-change-me", alias="VL_JWT_SECRET")
    admin_username: str = Field(default="admin", alias="VL_ADMIN_USERNAME")
    admin_password: str = Field(default="admin123", alias="VL_ADMIN_PASSWORD")

    # Seed Hebrew demo data when DB has no cameras (local visual QA).
    # Default: on in development, off otherwise. Override with VL_SEED_DEMO=true|false.
    seed_demo: bool | None = Field(default=None, alias="VL_SEED_DEMO")

    # Feature flag env overrides: FEATURE_SIMULATE_DETECTIONS=true
    feature_simulate_detections: bool | None = Field(default=None, alias="FEATURE_SIMULATE_DETECTIONS")
    feature_video_lab: bool | None = Field(default=None, alias="FEATURE_VIDEO_LAB")
    feature_live_video: bool | None = Field(default=None, alias="FEATURE_LIVE_VIDEO")
    feature_web_push: bool | None = Field(default=None, alias="FEATURE_WEB_PUSH")
    feature_cloud_sync: bool | None = Field(default=None, alias="FEATURE_CLOUD_SYNC")
    feature_skills: bool | None = Field(default=None, alias="FEATURE_SKILLS")
    feature_natural_language_rules: bool | None = Field(
        default=None, alias="FEATURE_NATURAL_LANGUAGE_RULES"
    )
    feature_semantic_search: bool | None = Field(default=None, alias="FEATURE_SEMANTIC_SEARCH")
    feature_onvif_discovery: bool | None = Field(default=None, alias="FEATURE_ONVIF_DISCOVERY")

    event_media_dir: str = Field(default="./data/event-media", alias="VL_EVENT_MEDIA_DIR")
    # Future cleanup jobs will delete files older than this many days (not enforced yet).
    event_media_retention_days: int | None = Field(
        default=None,
        alias="VL_EVENT_MEDIA_RETENTION_DAYS",
    )

    def feature_flags(self) -> dict[str, bool]:
        flags = _load_feature_defaults()
        overrides: dict[str, bool | None] = {
            "simulate_detections": self.feature_simulate_detections,
            "video_lab": self.feature_video_lab,
            "live_video": self.feature_live_video,
            "web_push": self.feature_web_push,
            "cloud_sync": self.feature_cloud_sync,
            "skills": self.feature_skills,
            "natural_language_rules": self.feature_natural_language_rules,
            "semantic_search": self.feature_semantic_search,
            "onvif_discovery": self.feature_onvif_discovery,
        }
        for key, value in overrides.items():
            if value is not None:
                flags[key] = value
        return flags

    def is_feature_enabled(self, name: str) -> bool:
        return bool(self.feature_flags().get(name, False))

    @property
    def should_seed_demo(self) -> bool:
        if self.seed_demo is not None:
            return bool(self.seed_demo)
        return self.environment.lower() in {"development", "dev", "local"}

    @property
    def schemas_dir(self) -> Path:
        return SCHEMAS_DIR

    def public_info(self) -> dict[str, Any]:
        return {
            "name": self.app_name,
            "version": self.app_version,
            "environment": self.environment,
            "features": self.feature_flags(),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
