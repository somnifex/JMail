from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.schemas import UserResponse
from app.services.email_service import EmailService
from app.services.mailbox_service import MailboxService
from app.services.system_config_service import SystemConfigService

router = APIRouter()


@router.get('/info')
async def get_system_info(_: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    runtime_settings = await SystemConfigService(db).get_runtime_settings()
    google_oauth = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET and settings.GOOGLE_REDIRECT_URI)
    microsoft_oauth = bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET and settings.MICROSOFT_REDIRECT_URI)

    return {
        'app_name': settings.APP_NAME,
        'app_version': settings.APP_VERSION,
        'features': {
            'oauth': bool(google_oauth or settings.GITHUB_CLIENT_ID or microsoft_oauth),
            'registration': runtime_settings.allow_registration,
            'google_oauth': google_oauth,
            'microsoft_web_auth': microsoft_oauth,
        },
    }


@router.get('/stats')
async def get_system_stats(current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox_service = MailboxService(db)
    email_service = EmailService(db)

    mailbox_count = await mailbox_service.count_by_user(current_user.id)
    email_stats = await email_service.get_user_stats(current_user.id)

    return {
        'user': {
            'id': current_user.id,
            'username': current_user.username,
            'email': current_user.email,
            'max_mailboxes': current_user.max_mailboxes,
        },
        'stats': {
            'mailbox_count': mailbox_count,
            'total_emails': email_stats.get('total', 0),
            'unread_emails': email_stats.get('unread', 0),
            'mailbox_stats': email_stats.get('mailbox_stats', []),
        },
    }
