"""
IMAP/SMTP 邮件服务
"""
import asyncio
import json
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from imap_tools import MailBox, AND, OR
from aiosmtplib import SMTP
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

from app.core.config import get_settings
from app.models import Mailbox, Email

settings = get_settings()


class IMAPService:
    """IMAP 邮件服务"""

    def __init__(self, mailbox: Mailbox):
        self.mailbox = mailbox
        self._client: Optional[MailBox] = None

    async def connect(self) -> bool:
        """连接 IMAP 服务器"""
        try:
            self._client = MailBox(self.mailbox.imap_server)
            self._client.login(
                self.mailbox.imap_username,
                self.mailbox.imap_password
            )
            return True
        except Exception as e:
            print(f"IMAP connect error: {e}")
            return False

    async def disconnect(self):
        """断开 IMAP 连接"""
        if self._client:
            try:
                self._client.logout()
            except:
                pass
            self._client = None

    async def fetch_emails(
        self,
        folder: str = "INBOX",
        limit: int = 50,
        unseen_only: bool = True
    ) -> List[dict]:
        """获取邮件列表"""
        if not self._client:
            if not await self.connect():
                return []

        try:
            # 选择文件夹
            self._client.folder.set(folder)

            # 构建查询条件
            if unseen_only:
                criteria = AND(seen=False)
            else:
                criteria = ALL

            # 获取邮件
            emails = []
            for msg in self._client.fetch(criteria, limit=limit):
                email_data = {
                    "uid": msg.uid,
                    "message_id": msg.message_id,
                    "subject": msg.subject,
                    "from": {
                        "name": msg.from_[0][0] if msg.from_ else "",
                        "email": msg.from_[0][1] if msg.from_ else ""
                    },
                    "to": [{"name": t[0], "email": t[1]} for t in msg.to],
                    "cc": [{"name": c[0], "email": c[1]} for c in msg.cc],
                    "date": msg.date.isoformat() if msg.date else None,
                    "text": msg.text,
                    "html": msg.html,
                    "flags": msg.flags,
                    "size": msg.size,
                    "attachments": [
                        {
                            "filename": att.filename,
                            "content_type": att.content_type,
                            "size": len(att.payload)
                        }
                        for att in msg.attachments
                    ]
                }
                emails.append(email_data)

            return emails

        except Exception as e:
            print(f"Fetch emails error: {e}")
            return []

    async def mark_as_seen(self, uid: str) -> bool:
        """标记邮件为已读"""
        if not self._client:
            return False

        try:
            self._client.flag([uid], [SEEN], True)
            return True
        except Exception as e:
            print(f"Mark as seen error: {e}")
            return False


class SMTPService:
    """SMTP 邮件发送服务"""

    def __init__(self, mailbox: Mailbox):
        self.mailbox = mailbox

    async def send_email(
        self,
        to: List[dict],
        subject: str,
        body: str,
        is_html: bool = False,
        cc: Optional[List[dict]] = None,
        bcc: Optional[List[dict]] = None,
        attachments: Optional[List[dict]] = None
    ) -> dict:
        """发送邮件"""
        try:
            # 创建邮件
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.mailbox.name} <{self.mailbox.email}>" if self.mailbox.name else self.mailbox.email

            # 添加收件人
            to_addrs = []
            to_list = [f"{t.get('name', '')} <{t['email']}>".strip() for t in to]
            msg['To'] = ', '.join(to_list)
            to_addrs.extend([t['email'] for t in to])

            # 添加抄送
            if cc:
                cc_list = [f"{c.get('name', '')} <{c['email']}>".strip() for c in cc]
                msg['Cc'] = ', '.join(cc_list)
                to_addrs.extend([c['email'] for c in cc])

            # 添加密送
            if bcc:
                to_addrs.extend([b['email'] for b in bcc])

            # 添加正文
            if is_html:
                msg.attach(MIMEText(body, 'html', 'utf-8'))
            else:
                msg.attach(MIMEText(body, 'plain', 'utf-8'))

            # 添加附件
            if attachments:
                for att in attachments:
                    filename = att.get('filename', 'attachment')
                    content_type = att.get('content_type', 'application/octet-stream')
                    data = att.get('data')  # base64

                    if data:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(base64.b64decode(data))
                        encoders.encode_base64(part)
                        part.add_header(
                            'Content-Disposition',
                            f'attachment; filename= "{filename}"'
                        )
                        msg.attach(part)

            # 发送
            if self.mailbox.smtp_use_ssl:
                server = smtplib.SMTP_SSL(self.mailbox.smtp_server, self.mailbox.smtp_port)
            else:
                server = smtplib.SMTP(self.mailbox.smtp_server, self.mailbox.smtp_port)

            if self.mailbox.smtp_use_tls and not self.mailbox.smtp_use_ssl:
                server.starttls()

            server.login(self.mailbox.smtp_username, self.mailbox.smtp_password)
            server.sendmail(self.mailbox.email, to_addrs, msg.as_string())
            server.quit()

            return {
                "success": True,
                "message_id": str(uuid.uuid4()),
                "error": None
            }

        except Exception as e:
            return {
                "success": False,
                "message_id": None,
                "error": str(e)
            }
