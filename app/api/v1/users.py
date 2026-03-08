"""
用户相关 API
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.v1.auth import get_current_active_user, get_current_admin_user, get_current_user
from app.core.database import get_db
from app.models.schemas import (
    UserUpdate, UserResponse, UserCreate,
    ChangePasswordRequest, RecoveryCodeResponse, RecoveryCodeGenerate
)
from app.services.user_service import UserService

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user = Depends(get_current_active_user)
):
    """获取当前登录用户信息"""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_data: UserUpdate,
    current_user = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """更新当前用户信息"""
    user_service = UserService(db)
    updated_user = await user_service.update(current_user.id, user_data)

    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse.model_validate(updated_user)


@router.post("/me/password")
async def change_password(
    request: ChangePasswordRequest,
    current_user = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码"""
    from app.core.security import verify_password

    # 验证当前密码
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="当前密码错误")

    # 更新密码
    user_service = UserService(db)
    await user_service.update_password(current_user.id, request.new_password)

    return {"message": "密码修改成功"}


# ==================== 管理员接口 ====================

@router.get("", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = None,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户列表（管理员）"""
    user_service = UserService(db)

    if status:
        from app.models.schemas import UserStatus
        status_enum = UserStatus(status)
    else:
        status_enum = None

    users, _ = await user_service.list_users(skip=skip, limit=limit, status=status_enum)
    return [UserResponse.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户信息（管理员）"""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse.model_validate(user)


@router.post("", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    max_mailboxes: int = 5,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """创建用户（管理员）"""
    user_service = UserService(db)

    # 检查邮箱是否已存在
    existing = await user_service.get_by_email(user_data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing = await user_service.get_by_username(user_data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = await user_service.create(user_data, max_mailboxes)
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户信息（管理员）"""
    user_service = UserService(db)
    updated_user = await user_service.update(user_id, user_data)

    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse.model_validate(updated_user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除用户（管理员）"""
    user_service = UserService(db)
    success = await user_service.delete(user_id)

    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return {"message": "User deleted successfully"}


@router.post("/{user_id}/password")
async def admin_reset_password(
    user_id: int,
    new_password: str,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """管理员重置用户密码"""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await user_service.update_password(user_id, new_password)
    return {"message": "Password reset successfully"}


@router.post("/{user_id}/recovery-code", response_model=RecoveryCodeResponse)
async def generate_recovery_code(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """生成用户找回码（管理员）"""
    from datetime import datetime, timedelta
    user_service = UserService(db)

    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    code = await user_service.generate_recovery_code(user_id)

    return RecoveryCodeResponse(
        recovery_code=code,
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
