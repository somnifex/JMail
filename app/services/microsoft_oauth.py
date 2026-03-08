from __future__ import annotations

import asyncio
import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import get_settings

settings = get_settings()

MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize'
MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
SCOPES = [
    'openid',
    'email',
    'profile',
    'offline_access',
    'User.Read',
    'https://outlook.office.com/IMAP.AccessAsUser.All',
    'https://outlook.office.com/SMTP.Send',
]


class MicrosoftOAuthService:
    """Compatibility wrapper for legacy Microsoft OAuth calls."""

    def __init__(self, client_id: str, client_secret: str, tenant_id: str = 'common'):
        self.client_id = client_id
        self.client_secret = client_secret
        self.tenant_id = tenant_id or 'common'

    def get_authorization_url(self, state: str, redirect_uri: str) -> str:
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'scope': ' '.join(SCOPES),
            'state': state,
            'prompt': 'select_account',
        }
        return f"{MICROSOFT_AUTH_URL.format(tenant=self.tenant_id)}?{urlencode(params)}"

    async def exchange_code_for_token(self, code: str, redirect_uri: str) -> dict[str, Any]:
        return await self._post_form(
            MICROSOFT_TOKEN_URL.format(tenant=self.tenant_id),
            {
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'code': code,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
                'scope': ' '.join(SCOPES),
            },
        )

    async def refresh_access_token(self, refresh_token: str) -> dict[str, Any]:
        return await self._post_form(
            MICROSOFT_TOKEN_URL.format(tenant=self.tenant_id),
            {
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token',
                'scope': ' '.join(SCOPES),
            },
        )

    async def get_user_info(self, access_token: str) -> dict[str, Any]:
        return await self._get_json(
            f'{MICROSOFT_GRAPH_BASE}/me',
            {'Authorization': f'Bearer {access_token}'},
        )

    async def get_mailbox_settings(self, access_token: str) -> dict[str, Any]:
        del access_token
        return {
            'imap': {'server': 'outlook.office365.com', 'port': 993, 'use_ssl': True},
            'smtp': {'server': 'smtp.office365.com', 'port': 587, 'use_tls': True, 'use_ssl': False},
        }

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
            raise RuntimeError(body or str(exc)) from exc
        except URLError as exc:
            raise RuntimeError(str(exc)) from exc

    def _get_json_sync(self, url: str, headers: dict[str, str]) -> dict[str, Any]:
        request = Request(url, headers=headers)
        try:
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as exc:
            body = exc.read().decode('utf-8', errors='replace')
            raise RuntimeError(body or str(exc)) from exc
        except URLError as exc:
            raise RuntimeError(str(exc)) from exc


def get_microsoft_oauth_service() -> Optional[MicrosoftOAuthService]:
    if not settings.MICROSOFT_CLIENT_ID or not settings.MICROSOFT_CLIENT_SECRET:
        return None
    return MicrosoftOAuthService(
        client_id=settings.MICROSOFT_CLIENT_ID,
        client_secret=settings.MICROSOFT_CLIENT_SECRET,
        tenant_id=settings.MICROSOFT_TENANT_ID,
    )
