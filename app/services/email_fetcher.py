import email
import imaplib
import json
import re
import uuid
from datetime import datetime
from email import policy
from email.message import Message
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Mailbox, MailboxStatus
from app.models.email import Email
from app.models.schemas import EmailCreate
from app.services.email_service import EmailService
from app.services.mail_oauth_service import MailOAuthService

settings = get_settings()
LIST_PATTERN = re.compile(r'\((?P<flags>[^)]*)\)\s+"(?P<delimiter>[^"]*)"\s+(?P<name>.+)$')
FETCH_FLAGS_PATTERN = re.compile(r'FLAGS\s+\((?P<flags>[^)]*)\)')
TRASH_KEYWORDS = ('trash', 'deleted', 'bin', 'recycle')
ARCHIVE_KEYWORDS = ('archive', 'archiv')


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
            # 检查用户存储配额是否已满
            if mailbox.user.is_storage_full:
                error_msg = 'Storage quota exceeded, cannot fetch new emails'
                await mailbox_service.update_status(mailbox.id, MailboxStatus.ERROR, error_msg)
                return {'success': False, 'error': error_msg}

            client = await self._open_mailbox(mailbox)
            available_folders = self._list_available_folders(client)
            target_folders = self._resolve_target_folders(mailbox, available_folders)

            fetched_count = 0
            new_count = 0
            for folder in target_folders:
                selected = self._select_folder(client, folder['name'])
                if not selected:
                    continue

                status, data = client.uid('search', None, 'ALL')
                if status != 'OK':
                    continue

                uid_list = [item for item in (data[0] or b'').split() if item]
                recent_uids = list(reversed(uid_list[-limit:]))
                for uid in recent_uids:
                    status, msg_data = client.uid('fetch', uid, '(RFC822 FLAGS)')
                    if status != 'OK':
                        continue

                    raw_message = b''.join(
                        part[1]
                        for part in msg_data
                        if isinstance(part, tuple) and len(part) > 1 and part[1]
                    )
                    if not raw_message:
                        continue

                    parsed_message = email.message_from_bytes(raw_message, policy=policy.default)
                    message_id = (parsed_message.get('Message-ID') or '').strip() or f'uid:{uid.decode()}'
                    flags = self._extract_flags(msg_data)
                    existing = await self.email_service.get_by_message_id(mailbox.id, message_id)
                    if existing:
                        if await self._sync_existing_email(existing, folder['kind'], flags):
                            fetched_count += 1
                        continue

                    email_data = await self._parse_email(
                        parsed_message,
                        raw_message,
                        mailbox,
                        uid.decode(),
                        message_id,
                        folder['kind'],
                        flags,
                    )
                    await self.email_service.create(email_data)
                    fetched_count += 1
                    new_count += 1

            await mailbox_service.update_last_fetch(mailbox.id)
            return {'success': True, 'fetched': fetched_count, 'new': new_count, 'folders': [item['name'] for item in target_folders]}
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

    async def _sync_existing_email(self, existing: Email, folder_kind: str, flags: set[str]) -> bool:
        is_read = self._is_seen(flags)
        is_deleted = folder_kind == 'trash'
        is_archived = folder_kind == 'archive'

        changed = False
        if existing.is_read != is_read:
            existing.is_read = is_read
            changed = True
        if existing.is_deleted != is_deleted:
            existing.is_deleted = is_deleted
            changed = True
        if existing.is_archived != is_archived:
            existing.is_archived = is_archived
            changed = True
        if existing.is_deleted and existing.is_archived:
            existing.is_archived = False
            changed = True
        if existing.is_archived and existing.is_deleted:
            existing.is_deleted = False
            changed = True

        if changed:
            await self.db.commit()
            await self.db.refresh(existing)
        return changed

    async def _parse_email(
        self,
        message: Message,
        raw_message: bytes,
        mailbox: Mailbox,
        uid: str,
        message_id: str,
        folder_kind: str,
        flags: set[str],
    ) -> EmailCreate:
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
            is_read=self._is_seen(flags),
            is_deleted=folder_kind == 'trash',
            is_archived=folder_kind == 'archive',
        )

    def _list_available_folders(self, client) -> list[dict]:
        status, data = client.list()
        if status != 'OK':
            return []

        folders: list[dict] = []
        for raw_item in data or []:
            if not raw_item:
                continue
            line = raw_item.decode('utf-8', errors='ignore') if isinstance(raw_item, bytes) else str(raw_item)
            match = LIST_PATTERN.search(line)
            if not match:
                continue
            raw_name = match.group('name').strip()
            if raw_name.startswith('"') and raw_name.endswith('"'):
                raw_name = raw_name[1:-1].replace('\\"', '"')
            flags = {item.strip().lower() for item in match.group('flags').split() if item.strip()}
            folders.append({
                'name': raw_name,
                'normalized': raw_name.casefold(),
                'flags': flags,
                'kind': self._folder_kind(raw_name, flags),
            })
        return folders

    def _resolve_target_folders(self, mailbox: Mailbox, available_folders: list[dict]) -> list[dict]:
        configured = mailbox.fetch_folder_list
        resolved: list[dict] = []
        seen: set[str] = set()

        for target in configured:
            folder = self._match_folder(target, available_folders)
            if folder is None:
                folder = {'name': target, 'normalized': target.casefold(), 'flags': set(), 'kind': self._target_kind(target)}
            if folder['normalized'] in seen:
                continue
            seen.add(folder['normalized'])
            resolved.append(folder)

        if not resolved:
            return [{'name': 'INBOX', 'normalized': 'inbox', 'flags': {'\\inbox'}, 'kind': 'inbox'}]
        return resolved

    def _match_folder(self, target: str, available_folders: list[dict]) -> dict | None:
        normalized_target = target.strip().casefold()
        if not normalized_target:
            return None

        for folder in available_folders:
            if folder['normalized'] == normalized_target:
                return folder

        target_kind = self._target_kind(target)
        if target_kind in {'trash', 'archive'}:
            for folder in available_folders:
                if folder['kind'] == target_kind:
                    return folder

        if normalized_target == 'inbox':
            for folder in available_folders:
                if folder['kind'] == 'inbox':
                    return folder
        return None

    def _target_kind(self, target: str) -> str:
        normalized = target.strip().casefold()
        if normalized == 'inbox':
            return 'inbox'
        if any(keyword in normalized for keyword in TRASH_KEYWORDS) or '垃圾' in target or '废纸篓' in target:
            return 'trash'
        if any(keyword in normalized for keyword in ARCHIVE_KEYWORDS):
            return 'archive'
        return 'other'

    def _folder_kind(self, folder_name: str, flags: set[str]) -> str:
        lowered_name = folder_name.casefold()
        if '\\trash' in flags or any(keyword in lowered_name for keyword in TRASH_KEYWORDS) or '垃圾' in folder_name or '废纸篓' in folder_name:
            return 'trash'
        if '\\archive' in flags or any(keyword in lowered_name for keyword in ARCHIVE_KEYWORDS):
            return 'archive'
        if '\\inbox' in flags or lowered_name == 'inbox':
            return 'inbox'
        return 'other'

    def _select_folder(self, client, folder_name: str) -> bool:
        target = folder_name
        if any(char in folder_name for char in (' ', '&')) and not folder_name.startswith('"'):
            escaped = folder_name.replace('\\', '\\\\').replace('"', '\\"')
            target = f'"{escaped}"'
        status, _ = client.select(target)
        return status == 'OK'

    @staticmethod
    def _extract_flags(msg_data) -> set[str]:
        flags: set[str] = set()
        for part in msg_data or []:
            if not isinstance(part, tuple) or not part or not part[0]:
                continue
            header = part[0].decode('utf-8', errors='ignore') if isinstance(part[0], bytes) else str(part[0])
            match = FETCH_FLAGS_PATTERN.search(header)
            if not match:
                continue
            flags.update(item.strip() for item in match.group('flags').split() if item.strip())
        return flags

    @staticmethod
    def _is_seen(flags: set[str]) -> bool:
        lowered = {item.lower() for item in flags}
        return '\\seen' in lowered

    @staticmethod
    def _parse_addresses(values) -> list[dict]:
        addresses = []
        for name, address in getaddresses(values):
            if not address:
                continue
            addresses.append({'address': address, 'name': name or ''})
        return addresses