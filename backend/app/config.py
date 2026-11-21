from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """App settings, read from backend/.env (see .env.example). Every value has a working default."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'corvalis.db').as_posix()}"
    cors_origins: list[str] = ["http://localhost:5173"]
    seed_on_startup: bool = True

    # Local AI assistant (Ollama). The app works without it; only the assistant page needs it.
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:4b"
    docs_dir: Path = PROJECT_DIR / "docs"


settings = Settings()
