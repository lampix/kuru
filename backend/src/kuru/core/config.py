"""Application settings, loaded from environment variables prefixed with ``KURU_``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Every field can be overridden with an environment variable, e.g. ``KURU_DATA_DIR=/srv/kuru``.
    """

    model_config = SettingsConfigDict(env_prefix="KURU_", env_file=".env", extra="ignore")

    data_dir: Path = Field(
        default=Path("data"), description="Directory for the database and media."
    )
    database_url: str | None = Field(
        default=None, description="SQLAlchemy URL. Defaults to a SQLite file inside data_dir."
    )
    access_token: SecretStr | None = Field(
        default=None,
        description="Optional shared secret. When set, every API request must be authenticated.",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        description="Origins allowed to call the API directly (not needed via the proxy).",
    )
    auto_migrate: bool = Field(default=True, description="Migrate the DB on startup.")
    max_upload_mb: int = Field(default=2048, description="Maximum size of an imported archive.")
    default_timezone: str = Field(default="UTC", description="IANA timezone for day boundaries.")
    day_rollover_hour: int = Field(default=4, ge=0, le=23, description="Hour a new day starts.")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_database_url(self) -> str:
        """The database URL actually used by the engine."""
        return self.database_url or f"sqlite:///{self.data_dir / 'kuru.db'}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def media_dir(self) -> Path:
        """Content-addressed media storage directory."""
        return self.data_dir / "media"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def upload_dir(self) -> Path:
        """Temporary buffer for uploaded archives awaiting import."""
        return self.data_dir / "uploads"

    def ensure_directories(self) -> None:
        """Create the data directories if they do not exist yet."""
        for path in (self.data_dir, self.media_dir, self.upload_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
