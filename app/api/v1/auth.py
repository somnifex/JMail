"""
认证相关 API
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.config import get_settings
from app.models.schemas import (
    LoginRequest,
    Token,
    UserCreate,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.models.enums import UserRole, UserStatus
from app.services.auth_service import AuthService
from app.services.system_config_service import SystemConfigService
from app.services.user_service import UserService

router = APIRouter()
settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user_service = UserService(db)
    user = await user_service.get_by_id(int(user_id))
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(current_user=Depends(get_current_user)):
    if str(current_user.status) == UserStatus.INACTIVE.value:
        raise HTTPException(status_code=400, detail="用户账户已被停用")
    return current_user


async def get_current_admin_user(current_user=Depends(get_current_active_user)):
    if str(current_user.role) != UserRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    auth_service = AuthService(db)
    token = await auth_service.authenticate_user(login_data)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱/用户名或密码错误")
    return token


@router.post("/register", response_model=Token)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    runtime_settings = await SystemConfigService(db).get_runtime_settings()

    if not runtime_settings.allow_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前不允许注册")

    auth_service = AuthService(db)
    return await auth_service.register_user(
        user_data,
        max_mailboxes=runtime_settings.default_max_mailboxes_per_user,
    )


@router.post("/forgot-password")
async def forgot_password(request: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    user_service = UserService(db)
    user = await user_service.get_by_email(request.email)

    if not user:
        return {"message": "如果该邮箱存在，找回码已准备好"}

    await user_service.generate_recovery_code(user.id)
    return {"message": "请联系管理员获取找回码", "admin_email": settings.ADMIN_EMAIL}


@router.post("/reset-password")
async def reset_password(request: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    user_service = UserService(db)
    user = await user_service.verify_recovery_code(request.email, request.recovery_code)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的邮箱或找回码")

    await user_service.update_password(user.id, request.new_password)
    await user_service.clear_recovery_code(user.id)
    return {"message": "密码重置成功"}


@router.get("/me")
async def get_me(current_user=Depends(get_current_active_user)):
    from app.models.schemas import UserResponse

    return UserResponse.model_validate(current_user)

