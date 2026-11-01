from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")


class Settings(BaseSettings):
    """Application settings, read from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    # Background worker (python -m app.worker)
    worker_poll_interval: float = Field(default=2.0, gt=0, le=60)
    worker_http_port: int = Field(default=9000, ge=1, le=65535)

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Accept plain postgres URLs and make SQLAlchemy use the psycopg (v3) driver."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value


class LoggingSettings(BaseSettings):
    """Logging settings. Separate from Settings so logging can be set up without DATABASE_URL."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    log_format: Literal["json", "text"] = "json"
    log_level: str = "INFO"

    @field_validator("log_level")
    @classmethod
    def known_level(cls, value: str) -> str:
        level = value.strip().upper()
        if level not in LOG_LEVELS:
            raise ValueError(f"must be one of {', '.join(LOG_LEVELS)}")
        return level


@lru_cache
def get_settings() -> Settings:
    return Settings()
