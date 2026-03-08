from enum import Enum


class UserRole(str, Enum):
    """User role."""
    ADMIN = "admin"
    USER = "user"


class UserStatus(str, Enum):
    """User account status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class OAuthProvider(str, Enum):
    """Supported OAuth providers."""
    GOOGLE = "google"
    GITHUB = "github"
    MICROSOFT = "microsoft"


class MailboxStatus(str, Enum):
    """Mailbox status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


class EmailStatus(str, Enum):
    """Email status used by the API and frontend."""
    UNREAD = "unread"
    READ = "read"
    FLAGGED = "flagged"
    DELETED = "deleted"
    ARCHIVED = "archived"
