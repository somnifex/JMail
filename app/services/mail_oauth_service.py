from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, decode_token
from app.models import Mailbox

settings = get_settings()


class MailOAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.providers = {
            'google': {
                'label': 'Gmail',
                'auth_url': 'https://accounts.google.com/o/oauth2/v2/auth',
                'token_url': 'https://oauth2.googleapis.com/token',
                'userinfo_url': 'https://openidconnect.googleapis.com/v1/userinfo',
                'client_id': settings.GOOGLE_CLIENT_ID,
                'client_secret': settings.GOOGLE_CLIENT_SECRET,
                'redirect_uri': settings.GOOGLE_REDIRECT_URI,
                'scopes': ['openid', 'email', 'profile', 'https://mail.google.com/'],
                'auth_params': {
                    'access_type': 'offline',
                    'include_granted_scopes': 'true',
                    'prompt': 'consent',
                },
            },
            'microsoft': {
                'label': 'Microsoft Outlook',
                'auth_url': f'https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize',
                'token_url': f'https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/token',
                'userinfo_url': 'https://graph.microsoft.com/v1.0/me',
                'client_id': settings.MICROSOFT_CLIENT_ID,
                'client_secret': settings.MICROSOFT_CLIENT_SECRET,
                'redirect_uri': settings.MICROSOFT_REDIRECT_URI,
                'scopes': [
                    'openid',
                    'email',
                    'profile',
                    'offline_access',
                    'User.Read',
                    'https://outlook.office.com/IMAP.AccessAsUser.All',
                    'https://outlook.office.com/SMTP.Send',
                ],
                'auth_params': {'prompt': 'select_account'},
            },
        }

    def get_provider_config(self, provider: str) -> dict[str, Any]:
        config = self.providers.get(provider)
        if not config:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Unsupported OAuth provider')
        return config

    def is_enabled(self, provider: str) -> bool:
        config = self.get_provider_config(provider)
        return bool(config['client_id'] and config['client_secret'] and config['redirect_uri'])

    def build_state(self, provider: str, user_id: int, email_hint: str, mailbox_id: int | None = None) -> str:
        return create_access_token(
            {
                'sub': str(user_id),
                'type': 'mail_oauth_state',
                'provider': provider,
                'email_hint': email_hint,
                'mailbox_id': mailbox_id,
            },
            expires_delta=timedelta(minutes=15),
        )

    def decode_state(self, state: str, provider: str) -> dict[str, Any]:
        payload = decode_token(state)
        if not payload or payload.get('type') != 'mail_oauth_state' or payload.get('provider') != provider:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid OAuth state')
        return payload

    def build_authorization_url(self, provider: str, state: str, email_hint: str | None = None) -> str:
        config = self.get_provider_config(provider)
        if not self.is_enabled(provider):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"{config['label']} OAuth is not configured")

        params = {
            'client_id': config['client_id'],
            'response_type': 'code',
            'redirect_uri': config['redirect_uri'],
            'scope': ' '.join(config['scopes']),
            'state': state,
        }
        if email_hint:
            params['login_hint'] = email_hint
        params.update(config.get('auth_params', {}))
        return f"{config['auth_url']}?{urlencode(params)}"

    async def exchange_code_for_token(self, provider: str, code: str) -> dict[str, Any]:
        config = self.get_provider_config(provider)
        form_data = {
            'client_id': config['client_id'],
            'client_secret': config['client_secret'],
            'code': code,
            'redirect_uri': config['redirect_uri'],
            'grant_type': 'authorization_code',
        }
        if provider == 'microsoft':
            form_data['scope'] = ' '.join(config['scopes'])
        return await self._post_form(config['token_url'], form_data)

    async def refresh_access_token(self, provider: str, refresh_token: str) -> dict[str, Any]:
        config = self.get_provider_config(provider)
        form_data = {
            'client_id': config['client_id'],
            'client_secret': config['client_secret'],
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token',
        }
        if provider == 'microsoft':
            form_data['scope'] = ' '.join(config['scopes'])
        return await self._post_form(config['token_url'], form_data)

    async def get_profile(self, provider: str, access_token: str) -> dict[str, Any]:
        config = self.get_provider_config(provider)
        headers = {'Authorization': f'Bearer {access_token}'}
        return await self._get_json(config['userinfo_url'], headers)

    async def ensure_valid_access_token(self, mailbox: Mailbox) -> str:
        if not mailbox.use_oauth or not mailbox.oauth_provider:
            return mailbox.imap_password

        if mailbox.oauth_access_token and mailbox.oauth_token_expires_at:
            expires_at = mailbox.oauth_token_expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc) + timedelta(seconds=90):
                return mailbox.oauth_access_token

        if not mailbox.oauth_refresh_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OAuth refresh token is missing')

        token_data = await self.refresh_access_token(mailbox.oauth_provider, mailbox.oauth_refresh_token)
        self.apply_token_data(mailbox, token_data)
        await self.db.commit()
        await self.db.refresh(mailbox)
        return mailbox.oauth_access_token or ''

    def apply_token_data(self, mailbox: Mailbox, token_data: dict[str, Any]) -> None:
        mailbox.oauth_access_token = token_data.get('access_token')
        mailbox.oauth_refresh_token = token_data.get('refresh_token') or mailbox.oauth_refresh_token
        mailbox.oauth_token_type = token_data.get('token_type') or mailbox.oauth_token_type or 'Bearer'
        mailbox.oauth_scope = token_data.get('scope') or mailbox.oauth_scope
        expires_in = int(token_data.get('expires_in') or 3600)
        mailbox.oauth_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        mailbox.use_oauth = True

    @staticmethod
    def build_xoauth2_string(username: str, access_token: str) -> bytes:
        return f'user={username}\x01auth=Bearer {access_token}\x01\x01'.encode('utf-8')

    async def _post_form(self, url: str, form_data: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._post_form_sync, url, form_data)

    async def _get_json(self, url: str, headers: dict[str, str]) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_json_sync, url, headers)

    def _post_form_sync(self, url: str, form_data: dict[str, Any]) -> dict[str, Any]:
        payload = urlencode(form_data).encode('utf-8')
        request = Request(url, data=payload, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as exc:
            body = exc.read().decode('utf-8', errors='replace')
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=body or str(exc))
        except URLError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    def _get_json_sync(self, url: str, headers: dict[str, str]) -> dict[str, Any]:
        request = Request(url, headers=headers)
        try:
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as exc:
            body = exc.read().decode('utf-8', errors='replace')
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=body or str(exc))
        except URLError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
