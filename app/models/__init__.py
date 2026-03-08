# app/models/__init__.py
from app.models.user import User
from app.models.mailbox import Mailbox
from app.models.email import Email
from app.models.rule import MailRule
from app.models.system import SystemConfig, AuditLog
from app.models.enums import (
    UserRole, UserStatus, OAuthProvider,
    MailboxStatus, EmailStatus,
)

__all__ = [
    'User',
    'Mailbox',
    'Email',
    'MailRule',
    'SystemConfig',
    'AuditLog',
    'UserRole',
    'UserStatus',
    'OAuthProvider',
    'MailboxStatus',
    'EmailStatus',
]
