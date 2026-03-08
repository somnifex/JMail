import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.schemas import MailboxCreate, MailboxResponse, MailboxUpdate, UserResponse
from app.services.email_fetcher import EmailFetcher
from app.services.mail_oauth_service import MailOAuthService
from app.services.mail_provider_service import MailProviderService
from app.services.mailbox_service import MailboxService

router = APIRouter()


def _build_oauth_popup_html(payload: dict) -> HTMLResponse:
    script_payload = json.dumps(payload, ensure_ascii=False)
    title = '授权成功' if payload.get('success') else '授权未完成'
    description = '可以关闭此窗口。' if payload.get('success') else '请返回 JMail 重试。'
    return HTMLResponse(
        content=f"""<!doctype html>
<html lang='zh-CN'>
<head>
    <meta charset='utf-8'>
    <title>JMail 授权</title>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <style>
        body {{ font-family: 'Segoe UI', 'PingFang SC', sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fb; color: #102033; }}
        .card {{ width: min(92vw, 440px); padding: 28px; border-radius: 24px; background: white; box-shadow: 0 18px 48px rgba(16, 32, 51, 0.12); }}
        h1 {{ font-size: 20px; margin: 0 0 8px; }}
        p {{ margin: 0; line-height: 1.6; color: #516173; }}
        button {{ margin-top: 18px; width: 100%; min-height: 40px; border: 0; border-radius: 14px; background: #0f766e; color: white; font: inherit; cursor: pointer; }}
    </style>
</head>
<body>
    <div class='card'>
        <h1>{title}</h1>
        <p>{description}</p>
        <button type='button' onclick='window.close()'>关闭窗口</button>
    </div>
    <script>
        const payload = {script_payload};
        if (window.opener) {{
            window.opener.postMessage(payload, window.location.origin);
        }}
    </script>
</body>
</html>"""
    )


async def _handle_oauth_callback(
    provider: str,
    code: str | None,
    state: str | None,
    error: str | None,
    error_description: str | None,
    db: AsyncSession,
):
    if error:
        return _build_oauth_popup_html({
            'source': 'jmail-mailbox-oauth',
            'provider': provider,
            'success': False,
            'error': error,
            'error_description': error_description,
        })

    if not code:
        return _build_oauth_popup_html({
            'source': 'jmail-mailbox-oauth',
            'provider': provider,
            'success': False,
            'error': 'missing_code',
            'error_description': '授权回调未返回授权码。',
        })

    oauth_service = MailOAuthService(db)
    state_payload = oauth_service.decode_state(state or '', provider)
    token_data = await oauth_service.exchange_code_for_token(provider, code)
    profile = await oauth_service.get_profile(provider, token_data['access_token'])

    if provider == 'google':
        email = (profile.get('email') or state_payload.get('email_hint') or '').lower().strip()
        display_name = profile.get('name') or email.split('@')[0]
    else:
        email = (profile.get('mail') or profile.get('userPrincipalName') or state_payload.get('email_hint') or '').lower().strip()
        display_name = profile.get('displayName') or email.split('@')[0]

    if not email:
        raise HTTPException(status_code=400, detail='无法从 OAuth 资料中识别邮箱地址')

    mailbox = await MailboxService(db).upsert_oauth_mailbox(
        user_id=int(state_payload['sub']),
        provider=provider,
        email=email,
        name=display_name,
        token_data=token_data,
        mailbox_id=state_payload.get('mailbox_id'),
    )

    return _build_oauth_popup_html({
        'source': 'jmail-mailbox-oauth',
        'provider': provider,
        'success': True,
        'mailbox_id': mailbox.id,
        'email': mailbox.email,
        'name': mailbox.name,
    })


@router.get('/providers/catalog')
async def list_provider_catalog(current_user: UserResponse = Depends(get_current_active_user)):
    del current_user
    return MailProviderService(get_settings()).catalog()


@router.get('/providers/detect')
async def detect_provider(email: str = Query(..., min_length=3, max_length=320), current_user: UserResponse = Depends(get_current_active_user)):
    del current_user
    return MailProviderService(get_settings()).detect(email)


@router.get('/providers/oauth/google/start')
async def start_google_oauth(
    email: str = Query(..., min_length=3, max_length=320),
    mailbox_id: int | None = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    oauth_service = MailOAuthService(db)
    state = oauth_service.build_state('google', current_user.id, email, mailbox_id)
    return {'authorization_url': oauth_service.build_authorization_url('google', state, email), 'provider': 'google'}


@router.get('/providers/oauth/microsoft/start')
async def start_microsoft_oauth(
    email: str = Query(..., min_length=3, max_length=320),
    mailbox_id: int | None = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    oauth_service = MailOAuthService(db)
    state = oauth_service.build_state('microsoft', current_user.id, email, mailbox_id)
    return {'authorization_url': oauth_service.build_authorization_url('microsoft', state, email), 'provider': 'microsoft'}


@router.get('/providers/oauth/google/callback', name='mailbox_google_oauth_callback', response_class=HTMLResponse)
async def google_oauth_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_oauth_callback('google', code, state, error, error_description, db)


@router.get('/providers/oauth/microsoft/callback', name='mailbox_microsoft_oauth_callback', response_class=HTMLResponse)
async def microsoft_oauth_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_oauth_callback('microsoft', code, state, error, error_description, db)


@router.get('', response_model=list[MailboxResponse])
async def list_mailboxes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    mailboxes = await MailboxService(db).list_by_user(user_id=current_user.id, skip=skip, limit=limit)
    return [MailboxResponse.model_validate(item) for item in mailboxes]


@router.post('', response_model=MailboxResponse)
async def create_mailbox(data: MailboxCreate, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox = await MailboxService(db).create(user_id=current_user.id, data=data)
    return MailboxResponse.model_validate(mailbox)


@router.get('/{mailbox_id}', response_model=MailboxResponse)
async def get_mailbox(mailbox_id: int, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox = await MailboxService(db).get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')
    return MailboxResponse.model_validate(mailbox)


@router.put('/{mailbox_id}', response_model=MailboxResponse)
async def update_mailbox(mailbox_id: int, data: MailboxUpdate, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox = await MailboxService(db).update(mailbox_id=mailbox_id, user_id=current_user.id, data=data)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')
    return MailboxResponse.model_validate(mailbox)


@router.delete('/{mailbox_id}')
async def delete_mailbox(mailbox_id: int, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    success = await MailboxService(db).delete(mailbox_id=mailbox_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')
    return {'message': '邮箱账户已删除'}


@router.get('/{mailbox_id}/stats')
async def get_mailbox_stats(mailbox_id: int, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox_service = MailboxService(db)
    mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')
    return await mailbox_service.get_stats(mailbox_id)


@router.post('/{mailbox_id}/fetch')
async def trigger_fetch(mailbox_id: int, current_user: UserResponse = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    mailbox_service = MailboxService(db)
    mailbox = await mailbox_service.get_by_id_and_user(mailbox_id=mailbox_id, user_id=current_user.id)
    if not mailbox:
        raise HTTPException(status_code=404, detail='未找到邮箱账户')

    result = await EmailFetcher(db).fetch_mailbox(mailbox_id)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error') or '同步失败')
    return {'message': '同步已完成', 'mailbox_id': mailbox_id, **result}
