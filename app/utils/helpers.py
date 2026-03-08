"""
通用工具函数
"""
import re
import uuid
from datetime import datetime, timedelta
from typing import Optional


def generate_uuid() -> str:
    """生成 UUID"""
    return str(uuid.uuid4())


def generate_short_id() -> str:
    """生成短 ID"""
    return uuid.uuid4().hex[:12]


def sanitize_filename(filename: str) -> str:
    """清理文件名"""
    # 移除非法字符
    filename = re.sub(r'[\u003c>:"/\\|?*]', '_', filename)
    # 限制长度
    if len(filename) > 255:
        name, ext = filename[:255].rsplit('.', 1) if '.' in filename else (filename[:255], '')
        filename = f"{name}.{ext}" if ext else name
    return filename


def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"


def parse_email_address(address: str) -> tuple:
    """解析邮件地址"""
    match = re.match(r'"?([^"]*?)"?\s*<([^@]+@[^@]+\.[^@>]+)>', address)
    if match:
        return match.group(1).strip(), match.group(2)

    # 简单格式：只包含邮箱地址
    if re.match(r'^[^@]+@[^@]+\.[^@]+$', address):
        return "", address

    return address, ""


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """截断文本"""
    if not text:
        return ""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def get_relative_time(date: datetime) -> str:
    """获取相对时间描述"""
    now = datetime.utcnow()
    diff = now - date

    if diff.days == 0:
        if diff.seconds < 60:
            return "刚刚"
        if diff.seconds < 3600:
            return f"{diff.seconds // 60} 分钟前"
        return f"{diff.seconds // 3600} 小时前"
    elif diff.days == 1:
        return "昨天"
    elif diff.days < 7:
        return f"{diff.days} 天前"
    elif diff.days < 30:
        return f"{diff.days // 7} 周前"
    elif diff.days < 365:
        return f"{diff.days // 30} 个月前"
    else:
        return f"{diff.days // 365} 年前"


def mask_email(email: str) -> str:
    """遮盖邮箱地址"""
    if '@' not in email:
        return email[:2] + "***"

    local, domain = email.split('@', 1)

    if len(local) <= 2:
        masked_local = local
    else:
        masked_local = local[0] + "*" * (len(local) - 2) + local[-1]

    return f"{masked_local}@{domain}"


def validate_password(password: str) -> tuple[bool, str]:
    """验证密码强度"""
    if len(password) < 6:
        return False, "密码长度至少为 6 位"

    if len(password) < 8:
        return True, "密码强度：弱"

    has_digit = any(c.isdigit() for c in password)
    has_letter = any(c.isalpha() for c in password)
    has_special = any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password)

    if has_digit and has_letter and has_special:
        return True, "密码强度：强"
    elif has_digit and has_letter:
        return True, "密码强度：中"

    return True, "密码强度：弱"
