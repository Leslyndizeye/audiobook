from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:password@localhost:5432/audiobook"
    redis_url: str    = "redis://localhost:6379/0"
    secret_key: str   = "dev-secret-key"
    upload_dir: str   = "./uploads"
    audio_dir: str    = "./audio_output"
    max_upload_mb: int = 50

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.audio_dir).mkdir(parents=True, exist_ok=True)
