"""
认证服务层 - 处理登录、注册、OAuth 等认证相关逻辑
"""
from datetime import timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.models.schemas import LoginRequest, Token, UserCreate
from app.services.user_service import UserService

settings = get_settings()


class AuthService:
    """认证服务类"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_service = UserService(db)

    async def authenticate_user(self, login_data: LoginRequest) -> Optional[Token]:
        """验证用户凭据并返回令牌"""
        user = await self.user_service.get_by_email(login_data.username)
        if not user:
            user = await self.user_service.get_by_username(login_data.username)

        if not user:
            return None

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Account has been suspended',
            )

        if not user.hashed_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='This account uses OAuth login. Please use the appropriate login method.',
            )

        if not verify_password(login_data.password, user.hashed_password):
            return None

        await self.user_service.update_last_login(user.id)

        expires_delta = timedelta(days=7) if login_data.remember_me else timedelta(hours=24)
        access_token = create_access_token(
            data={'sub': str(user.id)},
            expires_delta=expires_delta,
        )

        from app.models.schemas import UserResponse

        return Token(
            access_token=access_token,
            token_type='bearer',
            expires_in=int(expires_delta.total_seconds()),
            user=UserResponse.model_validate(user),
        )

    async def register_user(
        self,
        user_data: UserCreate,
        max_mailboxes: int = 5,
        storage_quota_bytes: Optional[int] = None,
    ) -> Token:
        """注册用户"""
        existing_user = await self.user_service.get_by_email(user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Email already registered',
            )

        existing_user = await self.user_service.get_by_username(user_data.username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Username already taken',
            )

        user = await self.user_service.create(
            user_data,
            max_mailboxes=max_mailboxes,
            storage_quota_bytes=storage_quota_bytes,
        )

        access_token = create_access_token(data={'sub': str(user.id)})

        from app.models.schemas import UserResponse

        return Token(
            access_token=access_token,
            token_type='bearer',
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user),
        )

    async def oauth_authenticate(
        self,
        provider: str,
        oauth_id: str,
        email: str,
        username: str,
        full_name: Optional[str] = None,
        avatar_url: Optional[str] = None,
        max_mailboxes: int = 5,
        storage_quota_bytes: Optional[int] = None,
    ) -> Token:
        """OAuth 认证/注册"""
        del avatar_url
        user = await self.user_service.get_by_oauth(provider, oauth_id)

        if not user:
            existing_user = await self.user_service.get_by_email(email)
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Email already exists. Please login and bind OAuth account in settings.',
                )

            base_username = username
            counter = 1
            while await self.user_service.get_by_username(username):
                username = f'{base_username}{counter}'
                counter += 1

            user = await self.user_service.create_oauth_user(
                email=email,
                username=username,
                full_name=full_name,
                provider=provider,
                oauth_id=oauth_id,
                max_mailboxes=max_mailboxes,
                storage_quota_bytes=storage_quota_bytes,
            )
        else:
            await self.user_service.update_last_login(user.id)

        access_token = create_access_token(data={'sub': str(user.id)})

        from app.models.schemas import UserResponse

        return Token(
            access_token=access_token,
            token_type='bearer',
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user),
        )
