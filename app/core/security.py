"""
安全相关工具模块
"""
import bcrypt
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # 先对密码进行 SHA-256 哈希，解决 bcrypt 72 字节限制
    prehashed_password = hashlib.sha256(plain_password.encode('utf-8')).digest()
    return bcrypt.checkpw(prehashed_password, hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """获取密码哈希"""
    # 先对密码进行 SHA-256 哈希，解决 bcrypt 72 字节限制
    prehashed_password = hashlib.sha256(password.encode('utf-8')).digest()
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prehashed_password, salt)
    return hashed.decode('utf-8')


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """创建 JWT 访问令牌"""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """解码 JWT 令牌"""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )
        return payload
    except JWTError:
        return None


def generate_recovery_code() -> str:
    """生成找回密码验证码"""
    import secrets
    import string
    # 生成 8 位字母数字混合验证码
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))
