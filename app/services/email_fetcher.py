import email
import imaplib
import json
import uuid
from datetime import datetime
from email import policy
from email.message import Message
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Mailbox, MailboxStatus
from app.models.schemas import EmailCreate
from app.services.email_service import EmailService
from app.services.mail_oauth_service import MailOAuthService

settings = get_settings()


class EmailFetcher:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.email_service = EmailService(db)
        self.oauth_service = MailOAuthService(db)

    async def fetch_mailbox(self, mailbox_id: int, limit: int = 100) -> dict:
        from app.services.mailbox_service import MailboxService

        mailbox_service = MailboxService(self.db)
        mailbox = await mailbox_service.get_by_id(mailbox_id)
        if not mailbox or not mailbox.is_active:
            return {'success': False, 'error': 'Mailbox not found or inactive'}

        client = None
        try:
            client = await self._open_mailbox(mailbox)
            client.select('INBOX')
            status, data = client.uid('search', None, 'ALL')
            if status != 'OK':
                raise RuntimeError('Failed to list mailbox messages')

            uid_list = [item for item in (data[0] or b'').split() if item]
            recent_uids = list(reversed(uid_list[-limit:]))

            fetched_count = 0
            new_count = 0
            for uid in recent_uids:
                status, msg_data = client.uid('fetch', uid, '(RFC822)')
                if status != 'OK':
                    continue
                raw_message = b''.join(part[1] for part in msg_data if isinstance(part, tuple) and len(part) > 1 and part[1])
                if not raw_message:
                    continue

                parsed_message = email.message_from_bytes(raw_message, policy=policy.default)
                message_id = parsed_message.get('Message-ID') or f'uid:{uid.decode()}'
                existing = await self.email_service.get_by_message_id(mailbox.id, message_id)
                if existing:
                    continue

                email_data = await self._parse_email(parsed_message, raw_message, mailbox, uid.decode(), message_id)
                await self.email_service.create(email_data)
                fetched_count += 1
                new_count += 1

            await mailbox_service.update_last_fetch(mailbox.id)
            return {'success': True, 'fetched': fetched_count, 'new': new_count}
        except Exception as exc:
            await mailbox_service.update_status(mailbox.id, MailboxStatus.ERROR, str(exc))
            return {'success': False, 'error': str(exc)}
        finally:
            if client:
                try:
                    client.logout()
                except Exception:
                    pass

    async def _open_mailbox(self, mailbox: Mailbox):
        client = imaplib.IMAP4_SSL(mailbox.imap_server, mailbox.imap_port) if mailbox.imap_use_ssl else imaplib.IMAP4(mailbox.imap_server, mailbox.imap_port)
        if mailbox.use_oauth and mailbox.oauth_provider:
            access_token = await self.oauth_service.ensure_valid_access_token(mailbox)
            auth_string = self.oauth_service.build_xoauth2_string(mailbox.imap_username or mailbox.email, access_token)
            client.authenticate('XOAUTH2', lambda _: auth_string)
        else:
            client.login(mailbox.imap_username, mailbox.imap_password)
        return client

    async def _parse_email(self, message: Message, raw_message: bytes, mailbox: Mailbox, uid: str, message_id: str) -> EmailCreate:
        to_list = self._parse_addresses(message.get_all('to', []))
        cc_list = self._parse_addresses(message.get_all('cc', []))
        reply_to_list = self._parse_addresses(message.get_all('reply-to', []))
        from_list = self._parse_addresses(message.get_all('from', []))
        from_item = from_list[0] if from_list else {'address': mailbox.email, 'name': ''}

        text_parts: list[str] = []
        html_parts: list[str] = []
        attachments: list[dict] = []

        if message.is_multipart():
            for part in message.walk():
                if part.get_content_maintype() == 'multipart':
                    continue
                disposition = part.get_content_disposition()
                payload = part.get_payload(decode=True) or b''
                charset = part.get_content_charset() or 'utf-8'
                content_type = part.get_content_type()

                if disposition == 'attachment':
                    attachments.append({
                        'filename': part.get_filename() or 'attachment',
                        'content_type': content_type,
                        'size': len(payload),
                    })
                    continue

                decoded = payload.decode(charset, errors='replace') if payload else ''
                if content_type == 'text/html':
                    html_parts.append(decoded)
                elif content_type == 'text/plain':
                    text_parts.append(decoded)
        else:
            payload = message.get_payload(decode=True) or b''
            charset = message.get_content_charset() or 'utf-8'
            decoded = payload.decode(charset, errors='replace') if payload else ''
            if message.get_content_type() == 'text/html':
                html_parts.append(decoded)
            else:
                text_parts.append(decoded)

        storage_path = None
        if settings.EMAIL_STORAGE_PATH:
            date_dir = datetime.utcnow().strftime('%Y/%m')
            storage_dir = Path(settings.EMAIL_STORAGE_PATH) / str(mailbox.id) / date_dir
            storage_dir.mkdir(parents=True, exist_ok=True)
            filename = f'{uuid.uuid4().hex}.eml'
            storage_path = str(storage_dir / filename)
            try:
                with open(storage_path, 'wb') as handle:
                    handle.write(raw_message)
            except OSError:
                storage_path = None

        sent_at = None
        if message.get('Date'):
            try:
                sent_at = parsedate_to_datetime(message.get('Date'))
            except (TypeError, ValueError, IndexError):
                sent_at = None

        return EmailCreate(
            mailbox_id=mailbox.id,
            uid=uid,
            message_id=message_id,
            from_address=from_item['address'],
            from_name=from_item['name'] or None,
            to_addresses=json.dumps(to_list, ensure_ascii=False),
            cc_addresses=json.dumps(cc_list, ensure_ascii=False) if cc_list else None,
            bcc_addresses=None,
            reply_to=reply_to_list[0]['address'] if reply_to_list else None,
            subject=message.get('Subject') or '',
            html_content='\n'.join(part for part in html_parts if part) or None,
            text_content='\n'.join(part for part in text_parts if part) or None,
            attachments=json.dumps(attachments, ensure_ascii=False) if attachments else None,
            has_attachments=bool(attachments),
            sent_at=sent_at,
            storage_path=storage_path,
        )

    @staticmethod
    def _parse_addresses(values) -> list[dict]:
        addresses = []
        for name, address in getaddresses(values):
            if not address:
                continue
            addresses.append({'address': address, 'name': name or ''})
        return addresses
