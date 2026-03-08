from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Mailbox
from app.models.rule import MailRule
from app.models.schemas import MailRuleCreate, MailRuleUpdate


class RuleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, rule_id: int) -> Optional[MailRule]:
        result = await self.db.execute(select(MailRule).where(MailRule.id == rule_id))
        return result.scalar_one_or_none()

    async def get_by_id_and_user(self, rule_id: int, user_id: int) -> Optional[MailRule]:
        result = await self.db.execute(select(MailRule).where(MailRule.id == rule_id, MailRule.user_id == user_id))
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: int) -> List[MailRule]:
        result = await self.db.execute(
            select(MailRule)
            .where(MailRule.user_id == user_id)
            .order_by(MailRule.updated_at.desc(), MailRule.id.desc())
        )
        return list(result.scalars().all())

    async def _validate_mailbox(self, user_id: int, mailbox_id: Optional[int]) -> None:
        if mailbox_id is None:
            return
        result = await self.db.execute(select(Mailbox).where(Mailbox.id == mailbox_id, Mailbox.user_id == user_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='未找到对应邮箱')

    async def create(self, user_id: int, data: MailRuleCreate) -> MailRule:
        await self._validate_mailbox(user_id, data.mailbox_id)
        rule = MailRule(
            user_id=user_id,
            mailbox_id=data.mailbox_id,
            name=data.name.strip(),
            match_field=data.match_field.strip(),
            match_operator=data.match_operator.strip(),
            match_value=data.match_value.strip(),
            action=data.action.strip(),
            is_active=bool(data.is_active),
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update(self, rule_id: int, user_id: int, data: MailRuleUpdate) -> Optional[MailRule]:
        rule = await self.get_by_id_and_user(rule_id, user_id)
        if not rule:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if 'mailbox_id' in update_data:
            await self._validate_mailbox(user_id, update_data['mailbox_id'])

        for field, value in update_data.items():
            if isinstance(value, str):
                value = value.strip()
            setattr(rule, field, value)

        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def delete(self, rule_id: int, user_id: int) -> bool:
        rule = await self.get_by_id_and_user(rule_id, user_id)
        if not rule:
            return False
        await self.db.delete(rule)
        await self.db.commit()
        return True
