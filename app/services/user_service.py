from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import generate_recovery_code, get_password_hash
from app.models import User
from app.models.enums import UserStatus
from app.models.schemas import UserCreate, UserUpdate

settings = get_settings()


class UserService:
    """User service."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email.lower().strip()))
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.username == username.strip()))
        return result.scalar_one_or_none()

    async def get_by_oauth(self, provider: str, oauth_id: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.oauth_provider == provider, User.oauth_id == oauth_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_data: UserCreate,
        max_mailboxes: int = 5,
        storage_quota_bytes: Optional[int] = None,
    ) -> User:
        resolved_quota = storage_quota_bytes or settings.DEFAULT_STORAGE_QUOTA_BYTES

        user = User(
            email=user_data.email.lower().strip(),
            username=user_data.username.strip(),
            hashed_password=get_password_hash(user_data.password),
            full_name=(user_data.full_name or '').strip() or None,
            max_mailboxes=max_mailboxes,
            storage_quota_bytes=resolved_quota,
            is_active=True,
            is_admin=False,
            is_verified=False,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def create_oauth_user(
        self,
        email: str,
        username: str,
        full_name: Optional[str],
        provider: str,
        oauth_id: str,
        max_mailboxes: int = 5,
        storage_quota_bytes: Optional[int] = None,
    ) -> User:
        resolved_quota = storage_quota_bytes or settings.DEFAULT_STORAGE_QUOTA_BYTES

        user = User(
            email=email.lower().strip(),
            username=username.strip(),
            hashed_password='',
            full_name=(full_name or '').strip() or None,
            max_mailboxes=max_mailboxes,
            storage_quota_bytes=resolved_quota,
            is_active=True,
            is_admin=False,
            is_verified=True,
            oauth_provider=provider,
            oauth_id=oauth_id,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update(self, user_id: int, user_data: UserUpdate) -> Optional[User]:
        user = await self.get_by_id(user_id)
        if not user:
            return None

        update_data = user_data.model_dump(exclude_unset=True)
        status_value = update_data.pop('status', None)
        if status_value is not None:
            normalized_status = self._normalize_status(status_value)
            user.is_active = normalized_status == UserStatus.ACTIVE.value

        if 'full_name' in update_data:
            user.full_name = (update_data.pop('full_name') or '').strip() or None

        if 'max_mailboxes' in update_data and update_data['max_mailboxes'] is not None:
            user.max_mailboxes = int(update_data.pop('max_mailboxes'))

        for field, value in update_data.items():
            if value is None:
                continue
            setattr(user, field, value)

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update_last_login(self, user_id: int) -> None:
        await self.db.execute(update(User).where(User.id == user_id).values(last_login=datetime.utcnow()))
        await self.db.commit()

    async def update_password(self, user_id: int, new_password: str) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(hashed_password=get_password_hash(new_password))
        )
        await self.db.commit()

    async def generate_recovery_code(self, user_id: int) -> str:
        code = generate_recovery_code()
        expires = datetime.utcnow() + timedelta(hours=24)
        await self.db.execute(
            update(User)
            .where(User.id == user_id)
            .values(recovery_code=code, recovery_code_expires=expires)
        )
        await self.db.commit()
        return code

    async def verify_recovery_code(self, email: str, code: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(
                User.email == email.lower().strip(),
                User.recovery_code == code,
                User.recovery_code_expires > datetime.utcnow(),
            )
        )
        return result.scalar_one_or_none()

    async def clear_recovery_code(self, user_id: int) -> None:
        await self.db.execute(
            update(User).where(User.id == user_id).values(recovery_code=None, recovery_code_expires=None)
        )
        await self.db.commit()

    async def delete(self, user_id: int) -> bool:
        user = await self.get_by_id(user_id)
        if not user:
            return False
        await self.db.delete(user)
        await self.db.commit()
        return True

    async def list_users(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[UserStatus | str] = None,
    ) -> tuple[List[User], int]:
        query = select(User)
        count_query = select(func.count(User.id))

        normalized_status = self._normalize_status(status) if status is not None else None
        if normalized_status == UserStatus.ACTIVE.value:
            query = query.where(User.is_active == True)
            count_query = count_query.where(User.is_active == True)
        elif normalized_status in {UserStatus.INACTIVE.value, UserStatus.SUSPENDED.value}:
            query = query.where(User.is_active == False)
            count_query = count_query.where(User.is_active == False)

        total_result = await self.db.execute(count_query)
        total = int(total_result.scalar_one() or 0)

        result = await self.db.execute(query.order_by(User.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all()), total

    async def count_users(self) -> int:
        result = await self.db.execute(select(func.count(User.id)))
        return int(result.scalar_one() or 0)

    @staticmethod
    def _normalize_status(status_value: UserStatus | str | Enum | None) -> Optional[str]:
        if status_value is None:
            return None
        if isinstance(status_value, Enum):
            raw_value = status_value.value
        else:
            raw_value = str(status_value)
        normalized = raw_value.strip().lower()
        if normalized not in {member.value for member in UserStatus}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid user status')
        return normalized

