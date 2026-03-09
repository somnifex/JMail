import os

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.security import get_password_hash

settings = get_settings()

os.makedirs(settings.data_dir_path, exist_ok=True)
os.makedirs(settings.email_storage_path, exist_ok=True)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    poolclass=NullPool,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    import app.models  # noqa: F401 - ensure metadata is populated before create_all

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_user_columns)
        await conn.run_sync(_ensure_mailbox_columns)
        await conn.run_sync(_ensure_email_columns)

    async with AsyncSessionLocal() as session:
        from app.models.system import SystemConfig
        from app.models.user import User

        result = await session.execute(select(User).where(User.is_admin == True))
        admin_user = result.scalar_one_or_none()
        if not admin_user:
            admin = User(
                email=settings.ADMIN_EMAIL,
                username='admin',
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                full_name='Administrator',
                is_admin=True,
                is_active=True,
                is_verified=True,
                max_mailboxes=100,
                storage_quota_bytes=settings.DEFAULT_STORAGE_QUOTA_BYTES,
            )
            session.add(admin)
            await session.commit()

        default_configs = [
            {'key': 'system_name', 'value': settings.APP_NAME, 'description': 'System name', 'is_editable': True},
            {'key': 'system_version', 'value': settings.APP_VERSION, 'description': 'System version', 'is_editable': False},
            {'key': 'allow_registration', 'value': str(settings.ALLOW_REGISTRATION).lower(), 'description': 'Allow new user registration', 'is_editable': True},
            {'key': 'default_max_mailboxes', 'value': str(settings.DEFAULT_MAX_MAILBOXES_PER_USER), 'description': 'Default mailbox quota per user', 'is_editable': True},
            {'key': 'default_fetch_interval', 'value': str(settings.DEFAULT_EMAIL_FETCH_INTERVAL), 'description': 'Default email fetch interval in seconds', 'is_editable': True},
            {'key': 'default_storage_quota_bytes', 'value': str(settings.DEFAULT_STORAGE_QUOTA_BYTES), 'description': 'Default storage quota per user in bytes', 'is_editable': True},
        ]

        for config in default_configs:
            result = await session.execute(select(SystemConfig).where(SystemConfig.key == config['key']))
            if not result.scalar_one_or_none():
                session.add(SystemConfig(**config))

        await session.commit()


def _ensure_table_columns(sync_conn, table_name: str, required_columns: dict[str, str]) -> None:
    inspector = inspect(sync_conn)
    if table_name not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
    for column_name, ddl in required_columns.items():
        if column_name in existing_columns:
            continue
        sync_conn.exec_driver_sql(f'ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}')


def _ensure_user_columns(sync_conn) -> None:
    _ensure_table_columns(
        sync_conn,
        'users',
        {
            'full_name': 'VARCHAR(100)',
        },
    )


def _ensure_mailbox_columns(sync_conn) -> None:
    _ensure_table_columns(
        sync_conn,
        'mailboxes',
        {
            'use_oauth': 'BOOLEAN DEFAULT 0',
            'oauth_provider': 'VARCHAR(50)',
            'oauth_access_token': 'TEXT',
            'oauth_refresh_token': 'TEXT',
            'oauth_token_type': 'VARCHAR(50)',
            'oauth_scope': 'TEXT',
            'oauth_token_expires_at': 'DATETIME',
            'fetch_folders': 'TEXT',
        },
    )


def _ensure_email_columns(sync_conn) -> None:
    _ensure_table_columns(
        sync_conn,
        'emails',
        {
            'is_archived': 'BOOLEAN DEFAULT 0',
        },
    )






