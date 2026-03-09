from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Integer, String, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.database import Base
from app.models.email import Email
from app.models.enums import UserRole, UserStatus


class User(Base):
    """Application user."""

    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    recovery_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    recovery_code_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    max_mailboxes: Mapped[int] = mapped_column(Integer, default=5)

    # 存储配额，单位字节，默认10GB
    storage_quota_bytes: Mapped[int] = mapped_column(Integer, default=10 * 1024 * 1024 * 1024)  # 10GB
    used_storage_bytes: Mapped[int] = column_property(
        select(func.coalesce(func.sum(Email.size_bytes), 0))
        .where(Email.user_id == id, Email.is_deleted == False)
        .correlate_except(Email)
        .scalar_subquery()
    )

    oauth_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    oauth_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    mailboxes: Mapped[List['Mailbox']] = relationship(
        'Mailbox',
        back_populates='user',
        cascade='all, delete-orphan',
        lazy='selectin',
    )

    def __repr__(self) -> str:
        return f'<User {self.username} ({self.email})>'

    @property
    def mailbox_count(self) -> int:
        return len(self.mailboxes) if self.mailboxes else 0

    @property
    def can_add_mailbox(self) -> bool:
        return self.mailbox_count < self.max_mailboxes

    @property
    def role(self) -> str:
        return UserRole.ADMIN.value if self.is_admin else UserRole.USER.value

    @property
    def status(self) -> str:
        return UserStatus.ACTIVE.value if self.is_active else UserStatus.INACTIVE.value

    @property
    def storage_usage_percent(self) -> float:
        """存储使用率，百分比"""
        if self.storage_quota_bytes <= 0:
            return 0.0
        return min((self.used_storage_bytes / self.storage_quota_bytes) * 100, 100.0)

    @property
    def is_storage_full(self) -> bool:
        """存储是否已满"""
        return self.used_storage_bytes >= self.storage_quota_bytes

