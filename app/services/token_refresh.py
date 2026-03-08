from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models import Mailbox
from app.services.mail_oauth_service import MailOAuthService

logger = logging.getLogger(__name__)
REFRESH_BEFORE_EXPIRY = 300


class TokenRefreshService:
    """Background token refresher for OAuth mailboxes."""

    def __init__(self):
        self.running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        if self.running:
            return
        self.running = True
        self._task = asyncio.create_task(self._refresh_loop())
        logger.info('Token refresh service started')

    async def stop(self):
        self.running = False
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        logger.info('Token refresh service stopped')

    async def _refresh_loop(self):
        while self.running:
            try:
                await self._refresh_due_mailboxes()
            except Exception as exc:
                logger.exception('Token refresh loop failed: %s', exc)
            await asyncio.sleep(60)

    async def _refresh_due_mailboxes(self):
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Mailbox).where(
                    Mailbox.use_oauth == True,
                    Mailbox.oauth_provider.isnot(None),
                    Mailbox.oauth_refresh_token.isnot(None),
                )
            )
            mailboxes = list(result.scalars().all())
            oauth_service = MailOAuthService(session)
            threshold = datetime.now(timezone.utc) + timedelta(seconds=REFRESH_BEFORE_EXPIRY)

            for mailbox in mailboxes:
                expires_at = mailbox.oauth_token_expires_at
                if expires_at is None:
                    continue
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at > threshold:
                    continue
                try:
                    token_data = await oauth_service.refresh_access_token(
                        mailbox.oauth_provider,
                        mailbox.oauth_refresh_token,
                    )
                    oauth_service.apply_token_data(mailbox, token_data)
                    await session.commit()
                except Exception as exc:
                    logger.warning('Failed to refresh mailbox %s token: %s', mailbox.id, exc)
                    await session.rollback()


token_refresh_service = TokenRefreshService()


async def start_token_refresh_service():
    await token_refresh_service.start()


async def stop_token_refresh_service():
    await token_refresh_service.stop()
