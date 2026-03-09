from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRole(str, Enum):
    ADMIN = 'admin'
    USER = 'user'


class UserStatus(str, Enum):
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    SUSPENDED = 'suspended'


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = Field(None, max_length=100)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=100)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    max_mailboxes: Optional[int] = Field(None, ge=1)
    storage_quota_bytes: Optional[int] = Field(None, ge=1 * 1024 * 1024 * 1024)
    status: Optional[UserStatus] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: UserRole
    status: UserStatus
    max_mailboxes: int
    storage_quota_bytes: int
    used_storage_bytes: int
    storage_usage_percent: float
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None


class UserInDB(UserResponse):
    hashed_password: Optional[str] = None
    recovery_code: Optional[str] = None
    recovery_code_expires: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    expires_in: int
    user: UserResponse


class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False


class OAuthLoginRequest(BaseModel):
    provider: str
    code: str
    redirect_uri: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    recovery_code: str = Field(..., min_length=8, max_length=8)
    new_password: str = Field(..., min_length=6, max_length=100)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class RecoveryCodeGenerate(BaseModel):
    user_id: int


class RecoveryCodeResponse(BaseModel):
    recovery_code: str
    expires_at: datetime


class RecoveryCodeVerify(BaseModel):
    email: EmailStr
    recovery_code: str


class OAuthConfig(BaseModel):
    enabled: bool = False
    provider: Optional[str] = None
    token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None


class MailboxBase(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(None, max_length=100)


class MailboxCreate(MailboxBase):
    imap_server: str = Field(..., max_length=255)
    imap_port: int = Field(default=993, ge=1, le=65535)
    imap_use_ssl: bool = True
    imap_username: str = Field(..., max_length=255)
    imap_password: Optional[str] = None

    smtp_server: str = Field(..., max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_use_ssl: bool = False
    smtp_use_tls: bool = True
    smtp_username: str = Field(..., max_length=255)
    smtp_password: Optional[str] = None

    use_oauth: bool = False
    oauth_provider: Optional[str] = None
    oauth_token: Optional[str] = None
    oauth_refresh_token: Optional[str] = None
    oauth_token_expires_at: Optional[datetime] = None

    fetch_interval: Optional[int] = Field(default=None, ge=60, le=3600)
    fetch_folders: Optional[str] = Field(default='INBOX\nTrash', max_length=2000)


class MailboxUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, max_length=100)
    imap_server: Optional[str] = Field(None, max_length=255)
    imap_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_use_ssl: Optional[bool] = None
    imap_username: Optional[str] = Field(None, max_length=255)
    imap_password: Optional[str] = None
    smtp_server: Optional[str] = Field(None, max_length=255)
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_use_ssl: Optional[bool] = None
    smtp_use_tls: Optional[bool] = None
    smtp_username: Optional[str] = Field(None, max_length=255)
    smtp_password: Optional[str] = None
    fetch_interval: Optional[int] = Field(None, ge=60, le=3600)
    fetch_folders: Optional[str] = Field(None, max_length=2000)
    status: Optional[str] = None
    use_oauth: Optional[bool] = None
    oauth_provider: Optional[str] = None
    oauth_token: Optional[str] = None
    oauth_refresh_token: Optional[str] = None
    oauth_token_expires_at: Optional[datetime] = None


class MailboxResponse(MailboxBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    imap_server: str
    imap_port: int
    imap_use_ssl: bool
    imap_username: str
    smtp_server: str
    smtp_port: int
    smtp_use_ssl: bool
    smtp_use_tls: bool
    smtp_username: str
    use_oauth: bool
    oauth_provider: Optional[str] = None
    oauth_token_expires_at: Optional[datetime] = None
    status: str
    fetch_interval: int
    fetch_folders: Optional[str] = None
    last_fetch: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MailboxInDB(MailboxResponse):
    imap_password: Optional[str] = None
    smtp_password: Optional[str] = None
    oauth_refresh_token: Optional[str] = None


class EmailAddress(BaseModel):
    address: EmailStr
    name: Optional[str] = None


class AttachmentInfo(BaseModel):
    filename: str
    content_type: str
    size: int
    content_id: Optional[str] = None


class EmailBase(BaseModel):
    subject: Optional[str] = None


class EmailCreate(EmailBase):
    mailbox_id: int
    uid: str
    message_id: Optional[str] = None

    from_address: str
    from_name: Optional[str] = None
    to_addresses: str
    cc_addresses: Optional[str] = None
    bcc_addresses: Optional[str] = None
    reply_to: Optional[str] = None

    html_content: Optional[str] = None
    text_content: Optional[str] = None

    attachments: Optional[str] = None
    has_attachments: bool = False

    sent_at: Optional[datetime] = None
    storage_path: Optional[str] = None
    is_read: bool = False
    is_deleted: bool = False
    is_archived: bool = False


class EmailUpdate(BaseModel):
    status: Optional[str] = None
    is_flagged: Optional[bool] = None
    is_deleted: Optional[bool] = None
    is_archived: Optional[bool] = None


class EmailResponse(EmailBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    mailbox_name: Optional[str] = None
    mailbox_email: Optional[str] = None
    uid: str
    message_id: Optional[str] = None

    from_address: str
    from_name: Optional[str] = None
    to_addresses: str
    cc_addresses: Optional[str] = None
    bcc_addresses: Optional[str] = None
    reply_to: Optional[str] = None

    html_content: Optional[str] = None
    text_content: Optional[str] = None

    attachments: Optional[str] = None
    has_attachments: bool

    status: str
    is_flagged: bool
    is_deleted: bool
    is_archived: bool

    sent_at: Optional[datetime] = None
    received_at: datetime
    created_at: datetime


class EmailListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    mailbox_name: Optional[str] = None
    mailbox_email: Optional[str] = None
    subject: Optional[str] = None
    from_address: str
    from_name: Optional[str] = None
    preview_text: Optional[str] = None
    sent_at: Optional[datetime] = None
    received_at: datetime
    status: str
    is_flagged: bool
    has_attachments: bool
    is_archived: bool
    is_deleted: bool


class EmailListResponse(BaseModel):
    total: int
    items: List[EmailListItem]


class ConversationResponse(BaseModel):
    thread_key: str
    subject: Optional[str] = None
    items: List[EmailListItem]


class MailRuleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    mailbox_id: Optional[int] = None
    match_field: str = Field(default='subject', min_length=2, max_length=40)
    match_operator: str = Field(default='contains', min_length=2, max_length=20)
    match_value: str = Field(..., min_length=1, max_length=500)
    action: str = Field(default='archive', min_length=2, max_length=30)
    is_active: bool = True


class MailRuleCreate(MailRuleBase):
    pass


class MailRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    mailbox_id: Optional[int] = None
    match_field: Optional[str] = Field(None, min_length=2, max_length=40)
    match_operator: Optional[str] = Field(None, min_length=2, max_length=20)
    match_value: Optional[str] = Field(None, min_length=1, max_length=500)
    action: Optional[str] = Field(None, min_length=2, max_length=30)
    is_active: Optional[bool] = None


class MailRuleResponse(MailRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class SendEmailRequest(BaseModel):
    mailbox_id: int
    to: List[EmailAddress]
    cc: Optional[List[EmailAddress]] = None
    bcc: Optional[List[EmailAddress]] = None
    subject: str
    body: str
    is_html: bool = False
    attachments: Optional[List[dict]] = None


class SendEmailResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


class SystemSettings(BaseModel):
    system_name: str = 'JMail'
    allow_registration: bool = True
    default_max_mailboxes_per_user: int = 5
    default_fetch_interval: int = 300
    default_storage_quota_bytes: int = 10 * 1024 * 1024 * 1024


class SystemSettingsUpdate(BaseModel):
    system_name: Optional[str] = Field(None, min_length=1, max_length=100)
    allow_registration: Optional[bool] = None
    default_max_mailboxes_per_user: Optional[int] = Field(None, ge=1, le=50)
    default_fetch_interval: Optional[int] = Field(None, ge=60, le=3600)
    default_storage_quota_bytes: Optional[int] = Field(None, ge=1 * 1024 * 1024 * 1024, le=1000 * 1024 * 1024 * 1024)


class DashboardStats(BaseModel):
    total_users: int
    total_mailboxes: int
    total_emails: int
    today_emails: int
    recent_users: List[UserResponse]
    system_status: str


class UserStats(BaseModel):
    total_mailboxes: int
    total_emails: int
    unread_emails: int
    storage_used: int
    mailbox_stats: List[dict]
