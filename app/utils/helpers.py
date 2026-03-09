import re
import uuid
from datetime import datetime


def generate_uuid() -> str:
    return str(uuid.uuid4())


def generate_short_id() -> str:
    return uuid.uuid4().hex[:12]


def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', '_', filename or '')
    cleaned = cleaned.strip().strip('.')
    return cleaned or 'file'


def format_size(size_bytes: float) -> str:
    value = float(size_bytes or 0)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if value < 1024:
            return f'{value:.1f} {unit}'
        value /= 1024
    return f'{value:.1f} PB'


def parse_email_address(address: str) -> tuple[str, str]:
    match = re.match(r'"?([^\"]*?)"?\s*<([^@]+@[^@]+\.[^@>]+)>', address or '')
    if match:
        return match.group(1).strip(), match.group(2)

    if re.match(r'^[^@]+@[^@]+\.[^@]+$', address or ''):
        return '', address

    return address or '', ''


def truncate_text(text: str, max_length: int = 100, suffix: str = '...') -> str:
    if not text:
        return ''
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix


def get_relative_time(date: datetime) -> str:
    now = datetime.utcnow()
    diff = now - date

    if diff.days == 0:
        if diff.seconds < 60:
            return '刚刚'
        if diff.seconds < 3600:
            return f'{diff.seconds // 60} 分钟前'
        return f'{diff.seconds // 3600} 小时前'
    if diff.days == 1:
        return '昨天'
    if diff.days < 7:
        return f'{diff.days} 天前'
    if diff.days < 30:
        return f'{diff.days // 7} 周前'
    if diff.days < 365:
        return f'{diff.days // 30} 月前'
    return f'{diff.days // 365} 年前'


def mask_email(email: str) -> str:
    if '@' not in (email or ''):
        return (email or '')[:2] + '***'

    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked_local = local
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]

    return f'{masked_local}@{domain}'


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 6:
        return False, '密码长度至少为 6 位'

    if len(password) < 8:
        return True, '密码强度：弱'

    has_digit = any(ch.isdigit() for ch in password)
    has_letter = any(ch.isalpha() for ch in password)
    has_special = any(ch in '!@#$%^&*()_+-=[]{}|;:,.<>?' for ch in password)

    if has_digit and has_letter and has_special:
        return True, '密码强度：强'
    if has_digit and has_letter:
        return True, '密码强度：中'
    return True, '密码强度：弱'
