"""
批量导入 API
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user
from app.core.database import get_db
from app.models.schemas import UserResponse, MailboxCreate
from app.services.batch_import import BatchImportService, ImportResult
from app.services.mailbox_service import MailboxService

router = APIRouter()


@router.post("/import/csv", response_model=ImportResult)
async def import_mailboxes_from_csv(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只支持 CSV 文件格式")

    try:
        content = (await file.read()).decode("utf-8")
        is_valid, errors = BatchImportService.validate_csv_format(content)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "CSV 格式验证失败", "errors": errors},
            )

        result = BatchImportService.import_from_csv(content=content, user_id=current_user.id)

        if result.data:
            mailbox_service = MailboxService(db)
            created_count = 0
            for mailbox_data in result.data:
                try:
                    mailbox_create = MailboxCreate(**mailbox_data)
                    await mailbox_service.create(user_id=current_user.id, data=mailbox_create)
                    created_count += 1
                except Exception as exc:
                    result.errors.append({
                        "email": mailbox_data.get("email", "unknown"),
                        "error": f"创建失败: {exc}",
                    })

            result.imported = created_count
            result.failed = len(result.errors)
            result.success = result.failed == 0

        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"导入失败: {exc}")


@router.post("/import/json", response_model=ImportResult)
async def import_mailboxes_from_json(
    file: Optional[UploadFile] = File(None),
    json_data: Optional[str] = Form(None),
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if file:
        if not file.filename.endswith(".json"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只支持 JSON 文件格式")
        content = (await file.read()).decode("utf-8")
    elif json_data:
        content = json_data
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请提供 JSON 文件或 json_data 参数")

    try:
        result = BatchImportService.import_from_json(content=content, user_id=current_user.id)

        if result.data:
            mailbox_service = MailboxService(db)
            created_count = 0
            for mailbox_data in result.data:
                try:
                    mailbox_create = MailboxCreate(**mailbox_data)
                    await mailbox_service.create(user_id=current_user.id, data=mailbox_create)
                    created_count += 1
                except Exception as exc:
                    result.errors.append({
                        "email": mailbox_data.get("email", "unknown"),
                        "error": f"创建失败: {exc}",
                    })

            result.imported = created_count
            result.failed = len(result.errors)
            result.success = result.failed == 0

        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"导入失败: {exc}")


@router.get("/templates/csv")
async def get_csv_template(current_user: UserResponse = Depends(get_current_active_user)):
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(
        content=BatchImportService.generate_csv_template(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=mailbox_template.csv"},
    )


@router.get("/templates/json")
async def get_json_template(current_user: UserResponse = Depends(get_current_active_user)):
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(
        content=BatchImportService.generate_json_template(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=mailbox_template.json"},
    )
