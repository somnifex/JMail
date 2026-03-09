import base64
import smtplib
import uuid
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from imap_tools import MailBox

from app.models import Mailbox


class IMAPService:
    def __init__(self, mailbox: Mailbox):
        self.mailbox = mailbox
        self._client: Optional[MailBox] = None

    async def connect(self) -> bool:
        try:
            client = MailBox(self.mailbox.imap_server)
            if self.mailbox.imap_use_ssl:
                client.login(self.mailbox.imap_username, self.mailbox.imap_password)
            else:
                client.login(self.mailbox.imap_username, self.mailbox.imap_password)
            self._client = client
            return True
        except Exception:
            self._client = None
            return False

    async def disconnect(self) -> None:
        if self._client:
            try:
                self._client.logout()
            except Exception:
                pass
            finally:
                self._client = None

    async def mark_as_seen(self, uid: str) -> bool:
        if not self._client:
            return False
        try:
            self._client.flag([uid], ['\\Seen'], True)
            return True
        except Exception:
            return False


class SMTPService:
    def __init__(self, mailbox: Mailbox):
        self.mailbox = mailbox

    async def send_email(
        self,
        subject: str,
        body: str,
        to: list[dict[str, Any]],
        cc: Optional[list[dict[str, Any]]] = None,
        bcc: Optional[list[dict[str, Any]]] = None,
        is_html: bool = False,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.mailbox.name} <{self.mailbox.email}>" if self.mailbox.name else self.mailbox.email

            to_addrs: list[str] = []
            to_list = [f"{item.get('name', '')} <{item['email']}>".strip() for item in to]
            msg['To'] = ', '.join(to_list)
            to_addrs.extend([item['email'] for item in to])

            if cc:
                cc_list = [f"{item.get('name', '')} <{item['email']}>".strip() for item in cc]
                msg['Cc'] = ', '.join(cc_list)
                to_addrs.extend([item['email'] for item in cc])

            if bcc:
                to_addrs.extend([item['email'] for item in bcc])

            msg.attach(MIMEText(body, 'html' if is_html else 'plain', 'utf-8'))

            if attachments:
                for att in attachments:
                    filename = att.get('filename', 'attachment')
                    data = att.get('data')
                    if not data:
                        continue
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(base64.b64decode(data))
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    msg.attach(part)

            if self.mailbox.smtp_use_ssl:
                server = smtplib.SMTP_SSL(self.mailbox.smtp_server, self.mailbox.smtp_port)
            else:
                server = smtplib.SMTP(self.mailbox.smtp_server, self.mailbox.smtp_port)

            if self.mailbox.smtp_use_tls and not self.mailbox.smtp_use_ssl:
                server.starttls()

            server.login(self.mailbox.smtp_username, self.mailbox.smtp_password)
            server.sendmail(self.mailbox.email, to_addrs, msg.as_string())
            server.quit()

            return {'success': True, 'message_id': str(uuid.uuid4()), 'error': None}
        except Exception as exc:
            return {'success': False, 'message_id': None, 'error': str(exc)}
