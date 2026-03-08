from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MailRule(Base):
    __tablename__ = 'mail_rules'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    mailbox_id: Mapped[Optional[int]] = mapped_column(ForeignKey('mailboxes.id', ondelete='CASCADE'), nullable=True, index=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    match_field: Mapped[str] = mapped_column(String(40), default='subject')
    match_operator: Mapped[str] = mapped_column(String(20), default='contains')
    match_value: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(String(30), default='archive')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped['User'] = relationship('User')
    mailbox: Mapped[Optional['Mailbox']] = relationship('Mailbox')

    def __repr__(self) -> str:
        return f"<MailRule {self.id}: {self.name}>"
