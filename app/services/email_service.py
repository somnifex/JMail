
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models import Email, EmailStatus, Mailbox
from app.models.schemas import EmailCreate, EmailUpdate

settings = get_settings()
REPLY_PREFIX_RE = re.compile(r'^(?:(?:re|fw|fwd|reply|forward)\\s*[:：]\\s*)+', re.IGNORECASE)


class EmailService:
    # Email service

    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage_path = Path(settings.email_storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def _get_storage_dir(self, mailbox_id: int, date: datetime) -> Path:
        path = self.storage_path / str(mailbox_id) / str(date.year) / str(date.month)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _get_storage_path(self, mailbox_id: int, email_uid: str, date: datetime) -> str:
        dir_path = self._get_storage_dir(mailbox_id, date)
        return str(dir_path / f"{email_uid}.eml")

    @staticmethod
    def normalize_subject(subject: Optional[str]) -> str:
        cleaned = REPLY_PREFIX_RE.sub('', str(subject or '').strip())
        cleaned = re.sub(r'\s+', ' ', cleaned).strip().lower()
        return cleaned or '(no-subject)'

    @classmethod
    def build_thread_key(cls, mailbox_id: int, subject: Optional[str]) -> str:
        return f'{mailbox_id}:{cls.normalize_subject(subject)}'

    @classmethod
    def _thread_key_for_email(cls, email: Email) -> str:
        return cls.build_thread_key(email.mailbox_id, email.subject)

    @staticmethod
    def _search_clauses(query_value: str, fields: Iterable[str]) -> list:
        search_pattern = f'%{query_value}%'
        field_set = {item for item in fields if item}
        if not field_set or 'all' in field_set:
            field_set = {'subject', 'sender', 'recipients', 'content', 'attachments'}

        clauses = []
        if 'subject' in field_set:
            clauses.append(Email.subject.ilike(search_pattern))
        if 'sender' in field_set:
            clauses.extend([
                Email.from_email.ilike(search_pattern),
                Email.from_name.ilike(search_pattern),
            ])
        if 'recipients' in field_set:
            clauses.extend([
                Email.to_addresses.ilike(search_pattern),
                Email.cc_addresses.ilike(search_pattern),
                Email.bcc_addresses.ilike(search_pattern),
            ])
        if 'content' in field_set:
            clauses.extend([
                Email.content_text.ilike(search_pattern),
                Email.content_html.ilike(search_pattern),
            ])
        if 'attachments' in field_set:
            clauses.append(Email.attachments.ilike(search_pattern))
        return clauses

    @classmethod
    def _build_filters(
        cls,
        *,
        user_id: Optional[int] = None,
        mailbox_id: Optional[int] = None,
        status: Optional[str] = None,
        is_flagged: Optional[bool] = None,
        query: Optional[str] = None,
        search_fields: Optional[Iterable[str]] = None,
        has_attachments: Optional[bool] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> list:
        filters = []

        if user_id is not None:
            filters.append(Email.user_id == user_id)

        if mailbox_id is not None:
            filters.append(Email.mailbox_id == mailbox_id)

        status_value = str(status) if status is not None else None
        if status_value == EmailStatus.DELETED.value:
            filters.append(Email.is_deleted == True)
        else:
            filters.append(Email.is_deleted == False)

            if status_value == EmailStatus.ARCHIVED.value:
                filters.append(Email.is_archived == True)
            else:
                if status_value in {None, '', 'all', EmailStatus.READ.value}:
                    filters.append(Email.is_archived == False)
                if status_value == EmailStatus.READ.value:
                    filters.append(Email.is_read == True)
                elif status_value == EmailStatus.UNREAD.value:
                    filters.append(Email.is_read == False)
                elif status_value == EmailStatus.FLAGGED.value:
                    filters.append(Email.is_starred == True)

        if is_flagged is not None:
            filters.append(Email.is_starred == is_flagged)

        if has_attachments is not None:
            filters.append(Email.has_attachments == has_attachments)

        if date_from is not None:
            filters.append(Email.received_at >= date_from)
        if date_to is not None:
            filters.append(Email.received_at <= date_to)

        query_value = (query or '').strip()
        if query_value:
            clauses = cls._search_clauses(query_value, search_fields or [])
            if clauses:
                filters.append(or_(*clauses))

        return filters

    async def get_by_id(self, email_id: int) -> Optional[Email]:
        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(Email.id == email_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_and_mailbox(self, email_id: int, mailbox_id: int) -> Optional[Email]:
        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(Email.id == email_id, Email.mailbox_id == mailbox_id)
        )
        return result.scalar_one_or_none()

    async def get_by_message_id(self, mailbox_id: int, message_id: str) -> Optional[Email]:
        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(Email.mailbox_id == mailbox_id, Email.message_id == message_id)
        )
        return result.scalar_one_or_none()

    async def get_by_uid(self, mailbox_id: int, uid: str) -> Optional[Email]:
        return await self.get_by_message_id(mailbox_id, uid)

    async def list_for_user(
        self,
        user_id: int,
        *,
        mailbox_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
        is_flagged: Optional[bool] = None,
        query: Optional[str] = None,
        search_fields: Optional[Iterable[str]] = None,
        has_attachments: Optional[bool] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> tuple[List[Email], int]:
        filters = self._build_filters(
            user_id=user_id,
            mailbox_id=mailbox_id,
            status=status,
            is_flagged=is_flagged,
            query=query,
            search_fields=search_fields,
            has_attachments=has_attachments,
            date_from=date_from,
            date_to=date_to,
        )

        total_result = await self.db.execute(select(func.count(Email.id)).where(*filters))
        total = int(total_result.scalar_one() or 0)

        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(*filters)
            .order_by(desc(Email.received_at), desc(Email.id))
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def list_by_mailbox(
        self,
        mailbox_id: int,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
        is_flagged: Optional[bool] = None,
        query: Optional[str] = None,
        search_fields: Optional[Iterable[str]] = None,
        has_attachments: Optional[bool] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> tuple[List[Email], int]:
        filters = self._build_filters(
            mailbox_id=mailbox_id,
            status=status,
            is_flagged=is_flagged,
            query=query,
            search_fields=search_fields,
            has_attachments=has_attachments,
            date_from=date_from,
            date_to=date_to,
        )

        total_result = await self.db.execute(select(func.count(Email.id)).where(*filters))
        total = int(total_result.scalar_one() or 0)

        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(*filters)
            .order_by(desc(Email.received_at), desc(Email.id))
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    async def create(self, data: EmailCreate) -> Email:
        mailbox_result = await self.db.execute(select(Mailbox).where(Mailbox.id == data.mailbox_id))
        mailbox = mailbox_result.scalar_one_or_none()
        if not mailbox:
            raise ValueError('Mailbox not found')

        resolved_message_id = data.message_id or data.uid or str(uuid.uuid4())

        email = Email(
            mailbox_id=data.mailbox_id,
            user_id=mailbox.user_id,
            message_id=resolved_message_id,
            subject=data.subject,
            from_name=data.from_name,
            from_email=data.from_address,
            to_addresses=data.to_addresses,
            cc_addresses=data.cc_addresses,
            bcc_addresses=data.bcc_addresses,
            sent_at=data.sent_at,
            content_text=data.text_content,
            content_html=data.html_content,
            attachments=data.attachments,
            has_attachments=data.has_attachments,
            storage_path=data.storage_path,
            is_read=bool(data.is_read),
            is_starred=False,
            is_deleted=bool(data.is_deleted),
            is_archived=bool(data.is_archived) and not bool(data.is_deleted),
        )

        self.db.add(email)
        await self.db.commit()
        await self.db.refresh(email)
        return email

    async def update(self, email_id: int, data: EmailUpdate) -> Optional[Email]:
        email = await self.get_by_id(email_id)
        if not email:
            return None

        update_data = data.model_dump(exclude_unset=True)

        status_value = update_data.pop('status', None)
        if status_value is not None:
            status_value = str(status_value)
            if status_value == EmailStatus.DELETED.value:
                email.is_deleted = True
                email.is_archived = False
            elif status_value == EmailStatus.ARCHIVED.value:
                email.is_deleted = False
                email.is_archived = True
            elif status_value == EmailStatus.READ.value:
                email.is_deleted = False
                email.is_read = True
            elif status_value == EmailStatus.UNREAD.value:
                email.is_deleted = False
                email.is_read = False
            elif status_value == EmailStatus.FLAGGED.value:
                email.is_deleted = False
                email.is_starred = True

        if 'is_flagged' in update_data and update_data['is_flagged'] is not None:
            email.is_starred = bool(update_data.pop('is_flagged'))

        if 'is_deleted' in update_data and update_data['is_deleted'] is not None:
            email.is_deleted = bool(update_data.pop('is_deleted'))
            if email.is_deleted:
                email.is_archived = False

        if 'is_archived' in update_data and update_data['is_archived'] is not None:
            email.is_archived = bool(update_data.pop('is_archived'))
            if email.is_archived:
                email.is_deleted = False

        for field, value in update_data.items():
            if value is None:
                continue
            setattr(email, field, value)

        await self.db.commit()
        await self.db.refresh(email)
        return email

    async def mark_as_read(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_read = True
        await self.db.commit()
        return True

    async def mark_as_unread(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_read = False
        await self.db.commit()
        return True

    async def toggle_flag(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_starred = not email.is_starred
        await self.db.commit()
        return email.is_starred

    async def archive(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_archived = True
        email.is_deleted = False
        await self.db.commit()
        return True

    async def unarchive(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_archived = False
        await self.db.commit()
        return True

    async def delete(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False
        email.is_deleted = True
        email.is_archived = False
        await self.db.commit()
        return True

    async def permanently_delete(self, email_id: int) -> bool:
        email = await self.get_by_id(email_id)
        if not email:
            return False

        if email.storage_path:
            try:
                if os.path.exists(email.storage_path):
                    os.remove(email.storage_path)
            except OSError:
                pass

        await self.db.delete(email)
        await self.db.commit()
        return True

    async def get_conversation(self, email_id: int) -> tuple[str, Optional[str], List[Email]]:
        email = await self.get_by_id(email_id)
        if not email:
            return '', None, []

        thread_key = self._thread_key_for_email(email)
        result = await self.db.execute(
            select(Email)
            .options(selectinload(Email.mailbox))
            .where(
                Email.user_id == email.user_id,
                Email.mailbox_id == email.mailbox_id,
            )
            .order_by(Email.received_at.asc(), Email.id.asc())
        )
        items = []
        for candidate in result.scalars().all():
            if self._thread_key_for_email(candidate) != thread_key:
                continue
            if email.is_deleted or not candidate.is_deleted:
                items.append(candidate)
        return thread_key, email.subject, items

    async def count_unread(self, mailbox_id: int) -> int:
        result = await self.db.execute(
            select(func.count(Email.id)).where(
                Email.mailbox_id == mailbox_id,
                Email.is_deleted == False,
                Email.is_read == False,
            )
        )
        return int(result.scalar_one() or 0)

    async def search(self, mailbox_id: int, query: str, skip: int = 0, limit: int = 50) -> tuple[List[Email], int]:
        return await self.list_by_mailbox(mailbox_id=mailbox_id, skip=skip, limit=limit, query=query)

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count(Email.id)).where(Email.is_deleted == False))
        return int(result.scalar_one() or 0)

    async def count_today(self) -> int:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        result = await self.db.execute(
            select(func.count(Email.id)).where(Email.received_at >= today_start, Email.is_deleted == False)
        )
        return int(result.scalar_one() or 0)

    async def get_user_stats(self, user_id: int) -> dict:
        total_result = await self.db.execute(
            select(func.count(Email.id)).where(Email.user_id == user_id, Email.is_deleted == False)
        )
        unread_result = await self.db.execute(
            select(func.count(Email.id)).where(
                Email.user_id == user_id,
                Email.is_deleted == False,
                Email.is_read == False,
            )
        )
        mailbox_result = await self.db.execute(
            select(Email.mailbox_id, func.count(Email.id))
            .where(Email.user_id == user_id, Email.is_deleted == False)
            .group_by(Email.mailbox_id)
        )

        mailbox_stats = [
            {'mailbox_id': mailbox_id, 'count': int(count or 0)}
            for mailbox_id, count in mailbox_result.all()
        ]

        return {
            'total': int(total_result.scalar_one() or 0),
            'unread': int(unread_result.scalar_one() or 0),
            'mailbox_stats': mailbox_stats,
        }




