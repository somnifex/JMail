"""
管理员相关 API
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_admin_user
from app.core.database import get_db
from app.models.schemas import (
    DashboardStats,
    RecoveryCodeResponse,
    SystemSettings,
    SystemSettingsUpdate,
    UserResponse,
)
from app.services.email_service import EmailService
from app.services.mailbox_service import MailboxService
from app.services.system_config_service import SystemConfigService
from app.services.user_service import UserService

router = APIRouter()


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    mailbox_service = MailboxService(db)
    email_service = EmailService(db)

    total_users = await user_service.count_users()
    total_mailboxes = await mailbox_service.count_all()
    total_emails = await email_service.count_all()
    today_emails = await email_service.count_today()
    recent_users, _ = await user_service.list_users(skip=0, limit=5)

    return DashboardStats(
        total_users=total_users,
        total_mailboxes=total_mailboxes,
        total_emails=total_emails,
        today_emails=today_emails,
        recent_users=[UserResponse.model_validate(user) for user in recent_users],
        system_status="healthy",
    )


@router.get("/settings", response_model=SystemSettings)
async def get_system_settings(
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await SystemConfigService(db).get_runtime_settings()


@router.put("/settings", response_model=SystemSettings)
async def update_system_settings(
    settings_update: SystemSettingsUpdate,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await SystemConfigService(db).update_runtime_settings(settings_update)


@router.get("/users", response_model=list[UserResponse])
async def admin_list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    users, _ = await user_service.list_users(skip=skip, limit=limit)
    return [UserResponse.model_validate(user) for user in users]


@router.post("/users/{user_id}/password")
async def admin_reset_user_password(
    user_id: int,
    new_password: str,
    generate_recovery: bool = True,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await user_service.update_password(user_id, new_password)
    response = {"message": "Password reset successfully"}

    if generate_recovery:
        response["recovery_code"] = await user_service.generate_recovery_code(user_id)

    return response


@router.post("/users/{user_id}/recovery-code", response_model=RecoveryCodeResponse)
async def admin_generate_recovery_code(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timedelta

    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    code = await user_service.generate_recovery_code(user_id)
    return RecoveryCodeResponse(recovery_code=code, expires_at=datetime.utcnow() + timedelta(hours=24))


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    _: UserResponse = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user_service = UserService(db)
    success = await user_service.delete(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}
