from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models import Email, Mailbox, MailboxStatus
from app.models.mailbox import DEFAULT_FETCH_FOLDERS
from app.models.schemas import MailboxCreate, MailboxUpdate
from app.services.mail_provider_service import MailProviderService
from app.services.system_config_service import SystemConfigService
from app.services.user_service import UserService


class MailboxService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_service = UserService(db)
        self.provider_service = MailProviderService(get_settings())

    async def get_by_id(self, mailbox_id: int) -> Optional[Mailbox]:
        result = await self.db.execute(
            select(Mailbox).options(selectinload(Mailbox.user)).where(Mailbox.id == mailbox_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[Mailbox]:
        result = await self.db.execute(select(Mailbox).where(Mailbox.email == email.lower()))
        return result.scalar_one_or_none()

    async def get_by_email_and_user(self, user_id: int, email: str) -> Optional[Mailbox]:
        result = await self.db.execute(select(Mailbox).where(Mailbox.user_id == user_id, Mailbox.email == email.lower()))
        return result.scalar_one_or_none()

    async def get_by_id_and_user(self, mailbox_id: int, user_id: int) -> Optional[Mailbox]:
        result = await self.db.execute(select(Mailbox).where(Mailbox.id == mailbox_id, Mailbox.user_id == user_id))
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> List[Mailbox]:
        result = await self.db.execute(
            select(Mailbox)
            .where(Mailbox.user_id == user_id)
            .order_by(Mailbox.updated_at.desc(), Mailbox.id.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_user(self, user_id: int) -> int:
        result = await self.db.execute(select(func.count(Mailbox.id)).where(Mailbox.user_id == user_id))
        return int(result.scalar_one() or 0)

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count(Mailbox.id)))
        return int(result.scalar_one() or 0)

    def normalize_fetch_folders(self, fetch_folders: Optional[str]) -> str:
        raw_value = (fetch_folders or DEFAULT_FETCH_FOLDERS).replace(',', '\n')
        folders: list[str] = []
        seen: set[str] = set()
        for item in raw_value.splitlines():
            value = item.strip()
            if not value:
                continue
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            folders.append(value)
        if not folders:
            folders = ['INBOX', 'Trash']
        return '\n'.join(folders)

    async def create(self, user_id: int, data: MailboxCreate) -> Mailbox:
        user = await self.user_service.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

        normalized_email = data.email.lower().strip()
        existing = await self.get_by_email_and_user(user_id, normalized_email)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Mailbox already exists')

        current_count = await self.count_by_user(user_id)
        if current_count >= user.max_mailboxes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Maximum mailbox limit ({user.max_mailboxes}) reached')

        runtime_settings = await SystemConfigService(self.db).get_runtime_settings()
        resolved_fetch_interval = data.fetch_interval if data.fetch_interval is not None else runtime_settings.default_fetch_interval

        mailbox = Mailbox(
            user_id=user_id,
            email=normalized_email,
            name=(data.name or normalized_email.split('@')[0]).strip(),
            imap_server=data.imap_server.strip(),
            imap_port=data.imap_port,
            imap_use_ssl=data.imap_use_ssl,
            imap_username=data.imap_username.strip(),
            imap_password=data.imap_password or '',
            smtp_server=data.smtp_server.strip(),
            smtp_port=data.smtp_port,
            smtp_use_ssl=data.smtp_use_ssl,
            smtp_use_tls=data.smtp_use_tls,
            smtp_username=data.smtp_username.strip(),
            smtp_password=data.smtp_password or '',
            use_oauth=bool(data.use_oauth),
            oauth_provider=data.oauth_provider,
            oauth_access_token=data.oauth_token,
            oauth_refresh_token=data.oauth_refresh_token,
            oauth_token_expires_at=data.oauth_token_expires_at,
            fetch_interval=resolved_fetch_interval,
            fetch_folders=self.normalize_fetch_folders(data.fetch_folders),
            is_active=True,
            last_error=None,
        )
        if mailbox.use_oauth and mailbox.oauth_access_token:
            mailbox.oauth_token_type = 'Bearer'

        self.db.add(mailbox)
        await self.db.commit()
        await self.db.refresh(mailbox)
        return mailbox

    async def update(self, mailbox_id: int, user_id: int, data: MailboxUpdate) -> Optional[Mailbox]:
        mailbox = await self.get_by_id_and_user(mailbox_id, user_id)
        if not mailbox:
            return None

        update_data = data.model_dump(exclude_unset=True)
        status_value = update_data.pop('status', None)
        if status_value is not None:
            status_value = str(status_value)
            if status_value == MailboxStatus.INACTIVE.value:
                mailbox.is_active = False
            else:
                mailbox.is_active = True
                if status_value == MailboxStatus.ACTIVE.value:
                    mailbox.last_error = None

        if 'email' in update_data and update_data['email']:
            normalized_email = update_data['email'].lower().strip()
            existing = await self.db.execute(
                select(Mailbox).where(Mailbox.user_id == user_id, Mailbox.email == normalized_email, Mailbox.id != mailbox_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Mailbox email already exists')
            update_data['email'] = normalized_email

        if 'fetch_folders' in update_data:
            update_data['fetch_folders'] = self.normalize_fetch_folders(update_data.get('fetch_folders'))

        for field, value in update_data.items():
            if value is None:
                continue
            if isinstance(value, str):
                value = value.strip()
            if field in {'imap_password', 'smtp_password'} and value == '':
                continue
            if field == 'oauth_token':
                mailbox.oauth_access_token = value
                continue
            if field == 'oauth_refresh_token':
                mailbox.oauth_refresh_token = value
                continue
            setattr(mailbox, field, value)

        mailbox.name = (mailbox.name or '').strip() or mailbox.email.split('@')[0]
        mailbox.email = mailbox.email.lower().strip()
        mailbox.imap_server = mailbox.imap_server.strip()
        mailbox.imap_username = mailbox.imap_username.strip()
        mailbox.smtp_server = mailbox.smtp_server.strip()
        mailbox.smtp_username = mailbox.smtp_username.strip()
        mailbox.fetch_folders = self.normalize_fetch_folders(mailbox.fetch_folders)

        await self.db.commit()
        await self.db.refresh(mailbox)
        return mailbox

    async def upsert_oauth_mailbox(
        self,
        user_id: int,
        provider: str,
        email: str,
        name: Optional[str],
        token_data: dict,
        mailbox_id: Optional[int] = None,
        fetch_interval: Optional[int] = None,
    ) -> Mailbox:
        email = email.lower().strip()
        user = await self.user_service.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

        mailbox = await self.get_by_id_and_user(mailbox_id, user_id) if mailbox_id else await self.get_by_email_and_user(user_id, email)
        is_new = mailbox is None
        if is_new:
            current_count = await self.count_by_user(user_id)
            if current_count >= user.max_mailboxes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Maximum mailbox limit ({user.max_mailboxes}) reached')
            mailbox = Mailbox(user_id=user_id, email=email, name=(name or email.split('@')[0]).strip())
            self.db.add(mailbox)

        defaults = self.provider_service.detect(email).get('manual_defaults', {})
        mailbox.email = email
        mailbox.name = (name or mailbox.name or email.split('@')[0]).strip()
        mailbox.imap_server = defaults.get('imap_server') or mailbox.imap_server or ''
        mailbox.imap_port = int(defaults.get('imap_port') or 993)
        mailbox.imap_use_ssl = bool(defaults.get('imap_use_ssl', True))
        mailbox.imap_username = email
        mailbox.imap_password = ''
        mailbox.smtp_server = defaults.get('smtp_server') or mailbox.smtp_server or ''
        mailbox.smtp_port = int(defaults.get('smtp_port') or 587)
        mailbox.smtp_use_ssl = bool(defaults.get('smtp_use_ssl', False))
        mailbox.smtp_use_tls = bool(defaults.get('smtp_use_tls', True))
        mailbox.smtp_username = email
        mailbox.smtp_password = ''
        mailbox.use_oauth = True
        mailbox.oauth_provider = provider
        mailbox.oauth_access_token = token_data.get('access_token')
        mailbox.oauth_refresh_token = token_data.get('refresh_token') or mailbox.oauth_refresh_token
        mailbox.oauth_token_type = token_data.get('token_type') or 'Bearer'
        mailbox.oauth_scope = token_data.get('scope')
        expires_in = int(token_data.get('expires_in') or 3600)
        mailbox.oauth_token_expires_at = token_data.get('oauth_token_expires_at') or datetime.utcnow() + timedelta(seconds=expires_in)

        resolved_fetch_interval = fetch_interval
        if resolved_fetch_interval is None and is_new:
            runtime_settings = await SystemConfigService(self.db).get_runtime_settings()
            resolved_fetch_interval = runtime_settings.default_fetch_interval

        mailbox.fetch_interval = resolved_fetch_interval or mailbox.fetch_interval or 300
        mailbox.fetch_folders = self.normalize_fetch_folders(mailbox.fetch_folders)
        mailbox.is_active = True
        mailbox.last_error = None

        await self.db.commit()
        await self.db.refresh(mailbox)
        return mailbox

    async def update_status(self, mailbox_id: int, status: MailboxStatus | str, error: Optional[str] = None) -> None:
        mailbox = await self.get_by_id(mailbox_id)
        if not mailbox:
            return

        status_value = status.value if isinstance(status, MailboxStatus) else str(status)
        mailbox.is_active = status_value != MailboxStatus.INACTIVE.value
        mailbox.last_error = error if status_value == MailboxStatus.ERROR.value else None
        await self.db.commit()

    async def update_last_fetch(self, mailbox_id: int) -> None:
        mailbox = await self.get_by_id(mailbox_id)
        if mailbox:
            mailbox.last_fetch = datetime.utcnow()
            mailbox.last_error = None
            await self.db.commit()

    async def delete(self, mailbox_id: int, user_id: int) -> bool:
        mailbox = await self.get_by_id_and_user(mailbox_id, user_id)
        if not mailbox:
            return False
        await self.db.delete(mailbox)
        await self.db.commit()
        return True

    async def get_stats(self, mailbox_id: int) -> dict:
        inbox_filter = [Email.mailbox_id == mailbox_id, Email.is_deleted == False, Email.is_archived == False]
        live_filter = [Email.mailbox_id == mailbox_id, Email.is_deleted == False]

        total_result = await self.db.execute(select(func.count(Email.id)).where(*inbox_filter))
        unread_result = await self.db.execute(select(func.count(Email.id)).where(Email.mailbox_id == mailbox_id, Email.is_deleted == False, Email.is_read == False))
        read_result = await self.db.execute(select(func.count(Email.id)).where(*inbox_filter, Email.is_read == True))
        flagged_result = await self.db.execute(select(func.count(Email.id)).where(*live_filter, Email.is_starred == True))
        archived_result = await self.db.execute(select(func.count(Email.id)).where(Email.mailbox_id == mailbox_id, Email.is_deleted == False, Email.is_archived == True))
        deleted_result = await self.db.execute(select(func.count(Email.id)).where(Email.mailbox_id == mailbox_id, Email.is_deleted == True))

        return {
            'total': int(total_result.scalar_one() or 0),
            'unread': int(unread_result.scalar_one() or 0),
            'read': int(read_result.scalar_one() or 0),
            'flagged': int(flagged_result.scalar_one() or 0),
            'archived': int(archived_result.scalar_one() or 0),
            'deleted': int(deleted_result.scalar_one() or 0),
        }
