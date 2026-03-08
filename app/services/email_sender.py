import base64
import smtplib
import ssl
import uuid
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Mailbox
from app.models.schemas import SendEmailRequest, SendEmailResponse
from app.services.mail_oauth_service import MailOAuthService


class EmailSender:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.oauth_service = MailOAuthService(db)

    async def send(self, mailbox: Mailbox, request: SendEmailRequest) -> SendEmailResponse:
        try:
            message = MIMEMultipart('alternative')
            message['Subject'] = request.subject
            message['From'] = f"{mailbox.name} <{mailbox.email}>" if mailbox.name else mailbox.email

            to_addrs = [item.address for item in request.to]
            message['To'] = ', '.join(to_addrs)
            if request.cc:
                cc_addrs = [item.address for item in request.cc]
                message['Cc'] = ', '.join(cc_addrs)
                to_addrs.extend(cc_addrs)
            if request.bcc:
                to_addrs.extend(item.address for item in request.bcc)

            body_part = MIMEText(request.body, 'html' if request.is_html else 'plain', 'utf-8')
            message.attach(body_part)

            if request.attachments:
                for attachment in request.attachments:
                    content = attachment.get('content')
                    if not content:
                        continue
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(base64.b64decode(content))
                    encoders.encode_base64(part)
                    filename = attachment.get('filename', 'attachment')
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(part)

            context = ssl.create_default_context()
            if mailbox.smtp_use_ssl:
                server = smtplib.SMTP_SSL(mailbox.smtp_server, mailbox.smtp_port, context=context, timeout=30)
            else:
                server = smtplib.SMTP(mailbox.smtp_server, mailbox.smtp_port, timeout=30)

            server.ehlo()
            if mailbox.smtp_use_tls and not mailbox.smtp_use_ssl:
                server.starttls(context=context)
                server.ehlo()

            if mailbox.use_oauth and mailbox.oauth_provider:
                access_token = await self.oauth_service.ensure_valid_access_token(mailbox)
                xoauth2 = self.oauth_service.build_xoauth2_string(mailbox.smtp_username or mailbox.email, access_token)
                auth_string = base64.b64encode(xoauth2).decode('utf-8')
                code, response = server.docmd('AUTH', f'XOAUTH2 {auth_string}')
                if code not in (235, 250):
                    raise RuntimeError((response or b'').decode('utf-8', errors='replace') or 'SMTP OAuth authentication failed')
            else:
                server.login(mailbox.smtp_username, mailbox.smtp_password)

            message_id = str(uuid.uuid4())
            server.sendmail(mailbox.email, to_addrs, message.as_string())
            server.quit()
            return SendEmailResponse(success=True, message_id=message_id, error=None)
        except Exception as exc:
            return SendEmailResponse(success=False, message_id=None, error=str(exc))
