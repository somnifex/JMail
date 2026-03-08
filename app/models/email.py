"""
邮件数据模型
"""
import re
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmailStatus

HTML_TAG_RE = re.compile(r"<[^>]+>")


class Email(Base):
    """邮件模型"""
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    mailbox_id: Mapped[int] = mapped_column(
        ForeignKey("mailboxes.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    message_id: Mapped[str] = mapped_column(String(512), index=True, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    from_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)

    to_addresses: Mapped[str] = mapped_column(Text, default="[]")
    cc_addresses: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bcc_addresses: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    content_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    storage_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    attachments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)

    size_bytes: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    mailbox: Mapped["Mailbox"] = relationship("Mailbox", back_populates="emails")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<Email {self.id}: {self.subject or '(no subject)'}>"

    @property
    def uid(self) -> str:
        return self.message_id

    @property
    def from_address(self) -> str:
        return self.from_email

    @property
    def text_content(self) -> Optional[str]:
        return self.content_text

    @property
    def html_content(self) -> Optional[str]:
        return self.content_html

    @property
    def reply_to(self) -> Optional[str]:
        return None

    @property
    def display_subject(self) -> str:
        return self.subject or "(无主题)"

    @property
    def display_from(self) -> str:
        if self.from_name:
            return f"{self.from_name} <{self.from_email}>"
        return self.from_email

    @property
    def status(self) -> str:
        if self.is_deleted:
            return EmailStatus.DELETED.value
        if self.is_archived:
            return EmailStatus.ARCHIVED.value
        if self.is_read:
            return EmailStatus.READ.value
        return EmailStatus.UNREAD.value

    @property
    def is_flagged(self) -> bool:
        return self.is_starred

    @property
    def mailbox_name(self) -> Optional[str]:
        return self.mailbox.display_name if self.mailbox else None

    @property
    def mailbox_email(self) -> Optional[str]:
        return self.mailbox.email if self.mailbox else None

    @property
    def preview_text(self) -> str:
        source = self.content_text or self.content_html or ""
        plain_text = HTML_TAG_RE.sub(" ", source)
        normalized = re.sub(r"\s+", " ", plain_text).strip()
        return normalized[:180]
