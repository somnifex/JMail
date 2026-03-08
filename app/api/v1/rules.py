"""
邮件规则相关 API
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_active_user
from app.core.database import get_db
from app.models.schemas import MailRuleCreate, MailRuleResponse, MailRuleUpdate, UserResponse
from app.services.rule_service import RuleService

router = APIRouter()


@router.get('', response_model=list[MailRuleResponse])
async def list_rules(
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rules = await RuleService(db).list_by_user(current_user.id)
    return [MailRuleResponse.model_validate(rule) for rule in rules]


@router.post('', response_model=MailRuleResponse)
async def create_rule(
    data: MailRuleCreate,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await RuleService(db).create(current_user.id, data)
    return MailRuleResponse.model_validate(rule)


@router.put('/{rule_id}', response_model=MailRuleResponse)
async def update_rule(
    rule_id: int,
    data: MailRuleUpdate,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await RuleService(db).update(rule_id, current_user.id, data)
    if not rule:
        raise HTTPException(status_code=404, detail='未找到规则')
    return MailRuleResponse.model_validate(rule)


@router.delete('/{rule_id}')
async def delete_rule(
    rule_id: int,
    current_user: UserResponse = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    success = await RuleService(db).delete(rule_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail='未找到规则')
    return {'message': '规则已删除'}
