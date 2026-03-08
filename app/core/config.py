from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    APP_NAME: str = 'JMail'
    APP_VERSION: str = '1.0.0'
    DEBUG: bool = False

    HOST: str = '0.0.0.0'
    PORT: int = 8000

    SECRET_KEY: str = 'change-this-secret-key'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    DATABASE_URL: str = 'sqlite+aiosqlite:///./data/app.db'

    DATA_DIR: str = './data'
    EMAIL_STORAGE_PATH: str = './data/emails'

    DEFAULT_EMAIL_FETCH_INTERVAL: int = 300
    MAX_EMAILS_PER_USER: int = 1000

    ADMIN_EMAIL: str = 'admin@example.com'
    ADMIN_PASSWORD: str = 'admin123'

    ALLOW_REGISTRATION: bool = True
    DEFAULT_MAX_MAILBOXES_PER_USER: int = 5

    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None
    MICROSOFT_CLIENT_ID: Optional[str] = None
    MICROSOFT_CLIENT_SECRET: Optional[str] = None
    MICROSOFT_TENANT_ID: str = 'common'
    MICROSOFT_REDIRECT_URI: Optional[str] = None

    @property
    def data_dir_path(self) -> Path:
        return Path(self.DATA_DIR).resolve()

    @property
    def email_storage_path(self) -> Path:
        return Path(self.EMAIL_STORAGE_PATH).resolve()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

