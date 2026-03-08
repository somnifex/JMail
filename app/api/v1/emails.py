"""
邮件相关 API
"""
import json
import uuid
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user
from app.core.database import get_db
from app.models.schemas import (
    ConversationResponse,
    EmailCreate,
    EmailListItem,
    EmailListResponse,
    EmailResponse,
    EmailUpdate,
    SendEmailRequest,
    SendEmailResponse,
    UserResponse,
)
from app.services.email_sender import EmailSender
from app.services.email_service import EmailService
from app.services.mailbox_service import MailboxService

router = APIRouter()


def _parse_search_fields(value: Optional[str]) -> list[str]:
    return [item.strip() for item in str(value or '').split(',') if item.strip()]


def _resolve_date_start(value: Optional[date]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time.min)


def _resolve_date_end(value: Optional[date]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time.max)


@router.get('', response_model=EmailListResponse)
async def list_user_emails(
    mailbox_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    is_flagged: Optional[bool] = None,
    search_fields: Optional[str] = Query(None, description='comma separated: all,subject,sender,recipients,content,attachments'),
    has_attachments: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    mailbox_service = MailboxService(db)
    if mailbox_id is not None:
        mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
        if not mailbox:
            raise HTTPException(status_code=404, detail='未找到邮箱账户')

    email_service = EmailService(db)
    emails, total = await email_service.list_for_user(
        user_id=current_user.id,
        mailbox_id=mailbox_id,
        skip=skip,
        limit=limit,
        status=status,
        is_flagged=is_flagged,
        query=q,
        search_fields=_parse_search_fields(search_fields),
        has_attachments=has_attachments,
        date_from=_resolve_date_start(date_from),
        date_to=_resolve_date_end(date_to),
    )
    return EmailListResponse(total=total, items=[EmailListItem.model_validate(email) for email in emails])


@router.get('/mailbox/{mailbox_id}', response_model=list[EmailListItem])
async def list_emails(
    mailbox_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    is_flagged: Optional[bool] = None,
    search_fields: Optional[str] = Query(None),
    has_attachments: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    mailbox_service = MailboxService(db)
    mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')

    email_service = EmailService(db)
    emails, _ = await email_service.list_by_mailbox(
        mailbox_id=mailbox_id,
        skip=skip,
        limit=limit,
        status=status,
        is_flagged=is_flagged,
        search_fields=_parse_search_fields(search_fields),
        has_attachments=has_attachments,
        date_from=_resolve_date_start(date_from),
        date_to=_resolve_date_end(date_to),
    )
    return [EmailListItem.model_validate(email) for email in emails]


@router.get('/mailbox/{mailbox_id}/search')
async def search_emails(
    mailbox_id: int,
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    mailbox_service = MailboxService(db)
    mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')

    email_service = EmailService(db)
    emails, total = await email_service.search(mailbox_id=mailbox_id, query=q, skip=skip, limit=limit)
    return {'total': total, 'items': [EmailListItem.model_validate(email) for email in emails]}


@router.get('/{email_id}/conversation', response_model=ConversationResponse)
async def get_email_conversation(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    thread_key, subject, items = await email_service.get_conversation(email_id)
    return ConversationResponse(
        thread_key=thread_key,
        subject=subject,
        items=[EmailListItem.model_validate(item) for item in items],
    )


@router.get('/{email_id}', response_model=EmailResponse)
async def get_email(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')

    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    if not email.is_read:
        await email_service.mark_as_read(email_id)
        email = await email_service.get_by_id(email_id)

    return EmailResponse.model_validate(email)


@router.put('/{email_id}', response_model=EmailResponse)
async def update_email(
    email_id: int,
    data: EmailUpdate,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')

    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    updated = await email_service.update(email_id, data)
    return EmailResponse.model_validate(updated)


@router.post('/{email_id}/read')
async def mark_email_read(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    await email_service.mark_as_read(email_id)
    return {'message': '邮件已标记为已读'}


@router.post('/{email_id}/unread')
async def mark_email_unread(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    await email_service.mark_as_unread(email_id)
    return {'message': '邮件已标记为未读'}


@router.post('/{email_id}/star')
async def toggle_email_star(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    is_starred = await email_service.toggle_flag(email_id)
    return {'message': ('邮件已设为星标' if is_starred else '邮件已取消星标'), 'is_starred': is_starred}


@router.post('/{email_id}/archive')
async def archive_email(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    await email_service.archive(email_id)
    return {'message': '邮件已归档'}


@router.post('/{email_id}/unarchive')
async def unarchive_email(
    email_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    await email_service.unarchive(email_id)
    return {'message': '邮件已移回收件箱'}


@router.delete('/{email_id}')
async def delete_email(
    email_id: int,
    permanent: bool = False,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    email_service = EmailService(db)
    email = await email_service.get_by_id(email_id)
    if not email:
        raise HTTPException(status_code=404, detail='未找到邮件')
    if email.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail='无权执行此操作')

    if permanent:
        await email_service.permanently_delete(email_id)
    else:
        await email_service.delete(email_id)

    return {'message': '邮件已删除'}


@router.post('/send', response_model=SendEmailResponse)
async def send_email(
    request: SendEmailRequest,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    mailbox_service = MailboxService(db)
    mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=request.mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')

    sender = EmailSender(db)
    result = await sender.send(mailbox, request)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error or '邮件发送失败')

    email_service = EmailService(db)
    attachment_meta = None
    if request.attachments:
        attachment_meta = json.dumps([
            {
                'filename': item.get('filename'),
                'content_type': item.get('content_type'),
                'size': item.get('size'),
            }
            for item in request.attachments
        ], ensure_ascii=False)

    sent_record = EmailCreate(
        mailbox_id=mailbox.id,
        uid=result.message_id or str(uuid.uuid4()),
        message_id=result.message_id or str(uuid.uuid4()),
        subject=request.subject,
        from_address=mailbox.email,
        from_name=mailbox.name,
        to_addresses=json.dumps([item.model_dump() for item in request.to], ensure_ascii=False),
        cc_addresses=json.dumps([item.model_dump() for item in request.cc], ensure_ascii=False) if request.cc else None,
        bcc_addresses=json.dumps([item.model_dump() for item in request.bcc], ensure_ascii=False) if request.bcc else None,
        html_content=request.body if request.is_html else None,
        text_content=request.body if not request.is_html else request.body,
        attachments=attachment_meta,
        has_attachments=bool(request.attachments),
        sent_at=datetime.utcnow(),
        storage_path=None,
    )
    await email_service.create(sent_record)
    return result
