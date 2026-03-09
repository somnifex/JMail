"""
用户相关 API
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user, get_current_admin_user
from app.core.database import get_db
from app.models.enums import UserStatus
from app.models.schemas import (
    ChangePasswordRequest,
    RecoveryCodeResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services.system_config_service import SystemConfigService
from app.services.user_service import UserService

router = APIRouter()


@router.get('/me', response_model=UserResponse)
async def get_current_user_info(current_user=Depends(get_current_active_user)):
    return UserResponse.model_validate(current_user)


@router.put('/me', response_model=UserResponse)
async def update_current_user(
    user_data: UserUpdate,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    updated_user = await user_service.update(current_user.id, user_data)
    if not updated_user:
        raise HTTPException(status_code=404, detail='User not found')
    return UserResponse.model_validate(updated_user)


@router.post('/me/password')
async def change_password(
    request: ChangePasswordRequest,
    current_user=Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from app.core.security import verify_password

    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail='当前密码错误')

    user_service = UserService(db)
    await user_service.update_password(current_user.id, request.new_password)
    return {'message': '密码修改成功'}


@router.get('', response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = Query(None),
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)

    status_enum = None
    if status:
        try:
            status_enum = UserStatus(status.strip().lower())
        except ValueError:
            raise HTTPException(status_code=400, detail='Invalid user status')

    users, _ = await user_service.list_users(skip=skip, limit=limit, status=status_enum)
    return [UserResponse.model_validate(u) for u in users]


@router.get('/{user_id}', response_model=UserResponse)
async def get_user(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    return UserResponse.model_validate(user)


@router.post('', response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    max_mailboxes: Optional[int] = Query(None, ge=1, le=50),
    storage_quota_bytes: Optional[int] = Query(None, ge=1 * 1024 * 1024 * 1024, le=1000 * 1024 * 1024 * 1024),
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)

    existing = await user_service.get_by_email(user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')

    existing = await user_service.get_by_username(user_data.username)
    if existing:
        raise HTTPException(status_code=400, detail='Username already taken')

    runtime_settings = await SystemConfigService(db).get_runtime_settings()
    resolved_max_mailboxes = max_mailboxes or runtime_settings.default_max_mailboxes_per_user
    resolved_storage_quota = storage_quota_bytes or runtime_settings.default_storage_quota_bytes

    user = await user_service.create(
        user_data,
        max_mailboxes=resolved_max_mailboxes,
        storage_quota_bytes=resolved_storage_quota,
    )

    return UserResponse.model_validate(user)


@router.put('/{user_id}', response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    updated_user = await user_service.update(user_id, user_data)

    if not updated_user:
        raise HTTPException(status_code=404, detail='User not found')

    return UserResponse.model_validate(updated_user)


@router.delete('/{user_id}')
async def delete_user(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    success = await user_service.delete(user_id)

    if not success:
        raise HTTPException(status_code=404, detail='User not found')

    return {'message': 'User deleted successfully'}


@router.post('/{user_id}/password')
async def admin_reset_password(
    user_id: int,
    new_password: str = Query(..., min_length=6, max_length=100),
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    await user_service.update_password(user_id, new_password)
    return {'message': 'Password reset successfully'}


@router.post('/{user_id}/recovery-code', response_model=RecoveryCodeResponse)
async def generate_recovery_code(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)

    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    code = await user_service.generate_recovery_code(user_id)

    return RecoveryCodeResponse(
        recovery_code=code,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
