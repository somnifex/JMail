"""
系统配置服务 - 统一读取和持久化可变系统设置
"""
from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.schemas import SystemSettings, SystemSettingsUpdate
from app.models.system import SystemConfig


class SystemConfigService:
    """系统配置服务"""

    CONFIG_META = {
        'allow_registration': '是否允许用户注册',
        'default_max_mailboxes': '用户默认最大邮箱数量',
        'default_fetch_interval': '默认邮件抓取间隔（秒）',
        'default_storage_quota_bytes': '用户默认存储配额，单位字节，默认10GB',
    }

    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()

    def _defaults(self) -> Dict[str, Any]:
        return {
            'allow_registration': self.settings.ALLOW_REGISTRATION,
            'default_max_mailboxes': self.settings.DEFAULT_MAX_MAILBOXES_PER_USER,
            'default_fetch_interval': self.settings.DEFAULT_EMAIL_FETCH_INTERVAL,
            'default_storage_quota_bytes': self.settings.DEFAULT_STORAGE_QUOTA_BYTES,
        }

    async def _load_configs(self) -> Dict[str, str]:
        result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key.in_(self.CONFIG_META.keys()))
        )
        return {item.key: item.value for item in result.scalars().all()}

    def _coerce(self, key: str, raw_value: Any) -> Any:
        defaults = self._defaults()
        if raw_value is None:
            return defaults[key]

        if key == 'allow_registration':
            if isinstance(raw_value, bool):
                return raw_value
            return str(raw_value).strip().lower() in {'1', 'true', 'yes', 'on'}

        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return int(defaults[key])

    async def get_runtime_settings(self) -> SystemSettings:
        stored = await self._load_configs()
        defaults = self._defaults()

        return SystemSettings(
            allow_registration=self._coerce('allow_registration', stored.get('allow_registration', defaults['allow_registration'])),
            default_max_mailboxes_per_user=self._coerce('default_max_mailboxes', stored.get('default_max_mailboxes', defaults['default_max_mailboxes'])),
            default_fetch_interval=self._coerce('default_fetch_interval', stored.get('default_fetch_interval', defaults['default_fetch_interval'])),
            default_storage_quota_bytes=self._coerce('default_storage_quota_bytes', stored.get('default_storage_quota_bytes', defaults['default_storage_quota_bytes'])),
        )

    async def update_runtime_settings(self, settings_update: SystemSettingsUpdate) -> SystemSettings:
        update_map = {
            'allow_registration': settings_update.allow_registration,
            'default_max_mailboxes': settings_update.default_max_mailboxes_per_user,
            'default_fetch_interval': settings_update.default_fetch_interval,
            'default_storage_quota_bytes': settings_update.default_storage_quota_bytes,
        }

        existing_result = await self.db.execute(
            select(SystemConfig).where(SystemConfig.key.in_(self.CONFIG_META.keys()))
        )
        existing = {item.key: item for item in existing_result.scalars().all()}

        changed = False
        for key, value in update_map.items():
            if value is None:
                continue

            serialized = str(value).lower() if isinstance(value, bool) else str(value)
            config = existing.get(key)
            if config:
                config.value = serialized
                config.description = self.CONFIG_META[key]
            else:
                self.db.add(
                    SystemConfig(
                        key=key,
                        value=serialized,
                        description=self.CONFIG_META[key],
                        is_editable=True,
                    )
                )
            changed = True

        if changed:
            await self.db.commit()

        return await self.get_runtime_settings()
