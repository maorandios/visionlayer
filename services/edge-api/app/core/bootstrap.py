"""Bootstrap default admin user and hub settings."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.models import Setting, User
from app.core.config import get_settings
from app.core.security import hash_password
from app.core.seed_demo import ensure_demo_seed

logger = logging.getLogger(__name__)


async def ensure_bootstrap(session: AsyncSession) -> None:
    settings = get_settings()
    result = await session.execute(select(User).where(User.username == settings.admin_username))
    user = result.scalar_one_or_none()
    if user is None:
        # bcrypt limit is 72 bytes — truncate defensively for seed password
        password = settings.admin_password[:72]
        user = User(
            id=str(uuid.uuid4()),
            username=settings.admin_username,
            password_hash=hash_password(password),
            role="admin",
        )
        session.add(user)
        logger.info("bootstrap_admin_created username=%s", settings.admin_username)

    setting = await session.get(Setting, "hub.timezone")
    if setting is None:
        session.add(Setting(key="hub.timezone", value_json="Asia/Jerusalem"))

    await session.commit()
    await ensure_demo_seed(session)
