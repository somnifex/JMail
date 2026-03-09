"""
Pydantic 模型定义 - 用于请求/响应验证
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==================== 用户相关模型 ====================

class UserRole(str, Enum):
    """用户角色"""
    ADMIN = "admin"
    USER = "user"


class UserStatus(str, Enum):
    """用户状态"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class UserBase(BaseModel):
    """用户基础模型"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = Field(None, max_length=100)


class UserCreate(UserBase):
    """用户创建模型"""
    password: str = Field(..., min_length=6, max_length=100)


class UserUpdate(BaseModel):
    """用户更新模型"""
    full_name: Optional[str] = Field(None, max_length=100)
    max_mailboxes: Optional[int] = Field(None, ge=1)
    status: Optional[UserStatus] = None


class UserResponse(UserBase):
    """用户响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: UserRole
    status: UserStatus
    max_mailboxes: int
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None


class UserInDB(UserResponse):
    """数据库中的用户模型（包含敏感信息）"""
    hashed_password: Optional[str] = None
    recovery_code: Optional[str] = None
    recovery_code_expires: Optional[datetime] = None


# ==================== 认证相关模型 ====================

class Token(BaseModel):
    """令牌模型"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class TokenPayload(BaseModel):
    """令牌载荷模型"""
    sub: Optional[int] = None
    exp: Optional[datetime] = None


class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str
    password: str
    remember_me: bool = False


class OAuthLoginRequest(BaseModel):
    """OAuth 登录请求模型"""
    provider: str
    code: str
    redirect_uri: str


class PasswordResetRequest(BaseModel):
    """密码重置请求模型"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """密码重置确认模型"""
    email: EmailStr
    recovery_code: str = Field(..., min_length=8, max_length=8)
    new_password: str = Field(..., min_length=6, max_length=100)


class ChangePasswordRequest(BaseModel):
    """修改密码请求模型"""
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


# ==================== 找回码相关模型 ====================

class RecoveryCodeGenerate(BaseModel):
    """生成找回码请求"""
    user_id: int


class RecoveryCodeResponse(BaseModel):
    """找回码响应"""
    recovery_code: str
    expires_at: datetime


class RecoveryCodeVerify(BaseModel):
    """验证找回码请求"""
    email: EmailStr
    recovery_code: str


# ==================== 邮箱相关模型 ====================

class OAuthConfig(BaseModel):
    """OAuth 配置"""
    enabled: bool = False
    provider: Optional[str] = None
    token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None


class MailboxBase(BaseModel):
    """邮箱基础模型"""
    email: EmailStr
    name: Optional[str] = Field(None, max_length=100)


class MailboxCreate(MailboxBase):
    """创建邮箱模型"""
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

    fetch_interval: int = Field(default=300, ge=60, le=3600)
    fetch_folders: Optional[str] = Field(default='INBOX\nTrash', max_length=2000)

class MailboxUpdate(BaseModel):
    """更新邮箱模型"""
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
    """邮箱响应模型"""
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
    """数据库中的邮箱模型（包含敏感信息）"""
    imap_password: Optional[str] = None
    smtp_password: Optional[str] = None
    oauth_refresh_token: Optional[str] = None


# ==================== 邮件相关模型 ====================

class EmailAddress(BaseModel):
    """邮件地址模型"""
    address: EmailStr
    name: Optional[str] = None


class AttachmentInfo(BaseModel):
    """附件信息"""
    filename: str
    content_type: str
    size: int
    content_id: Optional[str] = None


class EmailBase(BaseModel):
    """邮件基础模型"""
    subject: Optional[str] = None


class EmailCreate(EmailBase):
    """创建邮件模型"""
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
    """更新邮件模型"""
    status: Optional[str] = None
    is_flagged: Optional[bool] = None
    is_deleted: Optional[bool] = None
    is_archived: Optional[bool] = None


class EmailResponse(EmailBase):
    """邮件响应模型"""
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
    """邮件列表项（简化版，用于列表展示）"""
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
    """邮件列表响应模型"""
    total: int
    items: List[EmailListItem]


class ConversationResponse(BaseModel):
    """会话时间线响应"""
    thread_key: str
    subject: Optional[str] = None
    items: List[EmailListItem]


# ==================== 规则相关模型 ====================

class MailRuleBase(BaseModel):
    """规则基础模型"""
    name: str = Field(..., min_length=2, max_length=120)
    mailbox_id: Optional[int] = None
    match_field: str = Field(default='subject', min_length=2, max_length=40)
    match_operator: str = Field(default='contains', min_length=2, max_length=20)
    match_value: str = Field(..., min_length=1, max_length=500)
    action: str = Field(default='archive', min_length=2, max_length=30)
    is_active: bool = True


class MailRuleCreate(MailRuleBase):
    """创建规则模型"""


class MailRuleUpdate(BaseModel):
    """更新规则模型"""
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    mailbox_id: Optional[int] = None
    match_field: Optional[str] = Field(None, min_length=2, max_length=40)
    match_operator: Optional[str] = Field(None, min_length=2, max_length=20)
    match_value: Optional[str] = Field(None, min_length=1, max_length=500)
    action: Optional[str] = Field(None, min_length=2, max_length=30)
    is_active: Optional[bool] = None


class MailRuleResponse(MailRuleBase):
    """规则响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


# ==================== 邮件发送相关模型 ====================

class SendEmailRequest(BaseModel):
    """发送邮件请求"""
    mailbox_id: int
    to: List[EmailAddress]
    cc: Optional[List[EmailAddress]] = None
    bcc: Optional[List[EmailAddress]] = None
    subject: str
    body: str
    is_html: bool = False
    attachments: Optional[List[dict]] = None


class SendEmailResponse(BaseModel):
    """发送邮件响应"""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


# ==================== 系统设置模型 ====================

class SystemSettings(BaseModel):
    """系统设置"""
    allow_registration: bool = True
    default_max_mailboxes_per_user: int = 5
    default_fetch_interval: int = 300
    max_emails_per_user: int = 1000


class SystemSettingsUpdate(BaseModel):
    """系统设置更新"""
    allow_registration: Optional[bool] = None
    default_max_mailboxes_per_user: Optional[int] = Field(None, ge=1, le=50)
    default_fetch_interval: Optional[int] = Field(None, ge=60, le=3600)
    max_emails_per_user: Optional[int] = Field(None, ge=100, le=10000)


# ==================== 统计信息模型 ====================

class DashboardStats(BaseModel):
    """仪表盘统计"""
    total_users: int
    total_mailboxes: int
    total_emails: int
    today_emails: int
    recent_users: List[UserResponse]
    system_status: str


class UserStats(BaseModel):
    """用户统计"""
    total_mailboxes: int
    total_emails: int
    unread_emails: int
    storage_used: int
    mailbox_stats: List[dict]
