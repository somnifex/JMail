from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import MailboxStatus

DEFAULT_FETCH_FOLDERS = 'INBOX\nTrash'


class Mailbox(Base):
    __tablename__ = 'mailboxes'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    imap_server: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_use_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    imap_username: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_password: Mapped[str] = mapped_column(String(255), nullable=False)

    smtp_server: Mapped[str] = mapped_column(String(255), nullable=False)
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_use_ssl: Mapped[bool] = mapped_column(Boolean, default=False)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    smtp_username: Mapped[str] = mapped_column(String(255), nullable=False)
    smtp_password: Mapped[str] = mapped_column(String(255), nullable=False)

    use_oauth: Mapped[bool] = mapped_column(Boolean, default=False)
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    oauth_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oauth_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oauth_token_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    oauth_scope: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oauth_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    fetch_interval: Mapped[int] = mapped_column(Integer, default=300)
    fetch_folders: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=DEFAULT_FETCH_FOLDERS)
    last_fetch: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped['User'] = relationship('User', back_populates='mailboxes')
    emails: Mapped[list['Email']] = relationship(
        'Email',
        back_populates='mailbox',
        cascade='all, delete-orphan',
        lazy='selectin',
    )

    def __repr__(self) -> str:
        return f'<Mailbox {self.name} ({self.email})>'

    @property
    def display_name(self) -> str:
        return self.name or self.email

    @property
    def email_count(self) -> int:
        return len(self.emails) if self.emails else 0

    @property
    def status(self) -> str:
        if not self.is_active:
            return MailboxStatus.INACTIVE.value
        if self.last_error:
            return MailboxStatus.ERROR.value
        return MailboxStatus.ACTIVE.value

    @property
    def fetch_folder_list(self) -> list[str]:
        raw_value = (self.fetch_folders or DEFAULT_FETCH_FOLDERS).replace(',', '\n')
        folders: list[str] = []
        seen: set[str] = set()
        for item in raw_value.splitlines():
            value = item.strip()
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            folders.append(value)
        return folders or ['INBOX', 'Trash']