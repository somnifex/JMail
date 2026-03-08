from __future__ import annotations

import base64
import json
from typing import Any
from urllib.parse import urlencode

from app.core.config import Settings

MICROSOFT_AUTHORIZE_URL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize'
GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
MICROSOFT_SCOPES = [
    'openid',
    'email',
    'profile',
    'offline_access',
    'User.Read',
    'https://outlook.office.com/IMAP.AccessAsUser.All',
    'https://outlook.office.com/SMTP.Send',
]
GOOGLE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://mail.google.com/',
]


class MailProviderService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.providers = self._build_provider_map()

    def catalog(self) -> list[dict[str, Any]]:
        return [self._serialize_provider(provider) for provider in self.providers.values()]

    def detect(self, email: str | None) -> dict[str, Any]:
        normalized = (email or '').strip().lower()
        domain = normalized.split('@', 1)[1] if '@' in normalized else ''
        provider_id = self._match_provider(domain)
        provider = self.providers[provider_id]
        payload = self._serialize_provider(provider, domain=domain or None)
        payload.update({'matched': provider_id != 'custom', 'input_email': normalized or None, 'domain': domain or None})
        return payload

    def build_microsoft_authorization(self, email: str, callback_url: str) -> dict[str, Any]:
        email = email.strip().lower()
        available = bool(self.settings.MICROSOFT_CLIENT_ID and callback_url)
        if not available:
            return {'provider': 'microsoft', 'available': False, 'authorization_url': None, 'redirect_uri': callback_url}

        state = self._encode_state({'provider': 'microsoft', 'email': email})
        params = {
            'client_id': self.settings.MICROSOFT_CLIENT_ID,
            'response_type': 'code',
            'redirect_uri': callback_url,
            'response_mode': 'query',
            'scope': ' '.join(MICROSOFT_SCOPES),
            'state': state,
            'prompt': 'select_account',
            'login_hint': email,
        }
        auth_url = f"{MICROSOFT_AUTHORIZE_URL.format(tenant=self.settings.MICROSOFT_TENANT_ID)}?{urlencode(params)}"
        return {'provider': 'microsoft', 'available': True, 'authorization_url': auth_url, 'redirect_uri': callback_url, 'state': state}

    def decode_state(self, state: str | None) -> dict[str, Any]:
        if not state:
            return {}
        padding = '=' * (-len(state) % 4)
        try:
            raw = base64.urlsafe_b64decode(f'{state}{padding}'.encode('utf-8')).decode('utf-8')
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except (ValueError, json.JSONDecodeError):
            return {}

    def _encode_state(self, payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return base64.urlsafe_b64encode(raw).decode('utf-8').rstrip('=')

    def _match_provider(self, domain: str) -> str:
        if not domain:
            return 'custom'
        for provider_id, provider in self.providers.items():
            if provider_id == 'custom':
                continue
            if domain in provider.get('domains', set()):
                return provider_id
            if any(domain.endswith(suffix) for suffix in provider.get('suffixes', ())):
                return provider_id
            if any(domain.startswith(prefix) for prefix in provider.get('prefixes', ())):
                return provider_id
        return 'custom'

    def _serialize_provider(self, provider: dict[str, Any], domain: str | None = None) -> dict[str, Any]:
        manual_defaults = self._resolve_manual_defaults(provider, domain)
        oauth = provider.get('oauth') or None
        oauth_payload = None
        if oauth:
            oauth_payload = {
                'provider': oauth['provider'],
                'label': oauth['label'],
                'recommended': oauth.get('recommended', False),
                'web_auth_available': self._oauth_available(oauth['provider']),
                'start_endpoint': oauth.get('start_endpoint'),
                'requirements': oauth.get('requirements', []),
            }

        return {
            'id': provider['id'],
            'label': provider['label'],
            'description': provider['description'],
            'region': provider['region'],
            'domains': sorted(provider.get('domains', set())),
            'manual_defaults': manual_defaults,
            'recommended_auth_mode': provider.get('recommended_auth_mode', 'manual'),
            'auth_modes': provider.get('auth_modes', ['manual']),
            'oauth': oauth_payload,
        }

    def _oauth_available(self, provider: str) -> bool:
        if provider == 'google':
            return bool(self.settings.GOOGLE_CLIENT_ID and self.settings.GOOGLE_CLIENT_SECRET and self.settings.GOOGLE_REDIRECT_URI)
        if provider == 'microsoft':
            return bool(self.settings.MICROSOFT_CLIENT_ID and self.settings.MICROSOFT_CLIENT_SECRET and self.settings.MICROSOFT_REDIRECT_URI)
        return False

    def _resolve_manual_defaults(self, provider: dict[str, Any], domain: str | None = None) -> dict[str, Any]:
        defaults = provider['manual_defaults']
        return defaults(domain) if callable(defaults) else defaults

    def _build_provider_map(self) -> dict[str, dict[str, Any]]:
        return {
            'microsoft': {
                'id': 'microsoft',
                'label': 'Microsoft Outlook / Hotmail',
                'description': '适用于 Outlook.com、Hotmail、Live 等 Microsoft 个人邮箱。',
                'region': 'Global',
                'domains': {'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com'},
                'suffixes': ('outlook.',),
                'manual_defaults': lambda domain=None: self._manual_defaults('outlook.office365.com', 993, True, 'smtp.office365.com', 587, False, True),
                'auth_modes': ['oauth', 'manual'],
                'recommended_auth_mode': 'oauth',
                'oauth': {
                    'provider': 'microsoft',
                    'label': '连接 Outlook OAuth',
                    'recommended': True,
                    'start_endpoint': '/api/v1/mailboxes/providers/oauth/microsoft/start',
                    'requirements': ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
                },
            },
            'gmail': {
                'id': 'gmail',
                'label': 'Gmail',
                'description': '适用于 Gmail 和 Googlemail 邮箱。',
                'region': 'Global',
                'domains': {'gmail.com', 'googlemail.com'},
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.gmail.com', 993, True, 'smtp.gmail.com', 465, True, False),
                'auth_modes': ['oauth', 'manual'],
                'recommended_auth_mode': 'oauth',
                'oauth': {
                    'provider': 'google',
                    'label': '连接 Gmail OAuth',
                    'recommended': True,
                    'start_endpoint': '/api/v1/mailboxes/providers/oauth/google/start',
                    'requirements': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
                },
            },
            'icloud': {
                'id': 'icloud',
                'label': 'Apple iCloud Mail',
                'description': '适用于 iCloud、me.com、mac.com 邮箱。',
                'region': 'Global',
                'domains': {'icloud.com', 'me.com', 'mac.com'},
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.mail.me.com', 993, True, 'smtp.mail.me.com', 587, False, True),
            },
            'yahoo': {
                'id': 'yahoo',
                'label': 'Yahoo Mail',
                'description': '适用于 Yahoo 和其地区域邮箱域名。',
                'region': 'Global',
                'domains': {'ymail.com', 'rocketmail.com'},
                'prefixes': ('yahoo.',),
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.mail.yahoo.com', 993, True, 'smtp.mail.yahoo.com', 465, True, False),
            },
            'aol': {
                'id': 'aol',
                'label': 'AOL Mail',
                'description': '适用于 AOL 邮箱。',
                'region': 'US',
                'domains': {'aol.com'},
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.aol.com', 993, True, 'smtp.aol.com', 465, True, False),
            },
            'zoho': {
                'id': 'zoho',
                'label': 'Zoho Mail',
                'description': '适用于 Zoho 各区域邮箱。',
                'region': 'Global',
                'domains': {'zoho.com', 'zohomail.com', 'zoho.eu', 'zoho.in', 'zoho.com.au', 'zoho.jp'},
                'suffixes': ('zoho.eu', 'zoho.in', 'zoho.com.au', 'zoho.jp'),
                'manual_defaults': lambda domain=None: self._manual_defaults(f"imap.{domain or 'zoho.com'}", 993, True, f"smtp.{domain or 'zoho.com'}", 465, True, False),
            },
            'yandex': {
                'id': 'yandex',
                'label': 'Yandex Mail',
                'description': '适用于 Yandex 邮箱。',
                'region': 'RU/EU',
                'domains': {'yandex.ru', 'yandex.com', 'ya.ru'},
                'prefixes': ('yandex.',),
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.yandex.com', 993, True, 'smtp.yandex.com', 465, True, False),
            },
            'mailru': {
                'id': 'mailru',
                'label': 'Mail.ru',
                'description': '适用于 Mail.ru 及其家族域名。',
                'region': 'RU',
                'domains': {'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru'},
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.mail.ru', 993, True, 'smtp.mail.ru', 465, True, False),
            },
            'qq': {
                'id': 'qq',
                'label': 'QQ Mail / Foxmail',
                'description': '适用于 QQ 邮箱和 Foxmail。',
                'region': 'CN',
                'domains': {'qq.com', 'vip.qq.com', 'foxmail.com'},
                'manual_defaults': lambda domain=None: self._manual_defaults('imap.qq.com', 993, True, 'smtp.qq.com', 465, True, False),
            },
            'netease': {
                'id': 'netease',
                'label': 'NetEase Mail',
                'description': '适用于 163、126、yeah.net 等网易邮箱。',
                'region': 'CN',
                'domains': {'163.com', '126.com', 'yeah.net'},
                'manual_defaults': lambda domain=None: self._manual_defaults(f"imap.{domain or '163.com'}", 993, True, f"smtp.{domain or '163.com'}", 465, True, False),
            },
            'custom': {
                'id': 'custom',
                'label': '自定义 IMAP / SMTP',
                'description': '企业邮箱或未收录的服务商可在这里完全手动填写。',
                'region': 'Custom',
                'domains': set(),
                'manual_defaults': lambda domain=None: self._manual_defaults('', 993, True, '', 587, False, True),
            },
        }

    @staticmethod
    def _manual_defaults(imap_server: str, imap_port: int, imap_use_ssl: bool, smtp_server: str, smtp_port: int, smtp_use_ssl: bool, smtp_use_tls: bool) -> dict[str, Any]:
        return {
            'imap_server': imap_server,
            'imap_port': imap_port,
            'imap_use_ssl': imap_use_ssl,
            'smtp_server': smtp_server,
            'smtp_port': smtp_port,
            'smtp_use_ssl': smtp_use_ssl,
            'smtp_use_tls': smtp_use_tls,
        }
