import os
import secrets
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR.parent

class Settings(BaseSettings):
    # Application Info
    APP_NAME: str = "The WebCam"
    APP_ENV: str = "development"
    DEBUG: bool = False  # Always False in production; override via env
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # CORS — set CORS_ORIGINS in .env for production (comma-separated)
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # JWT Authentication — MUST override SECRET_KEY in production via env
    SECRET_KEY: str = "CHANGE_ME_use_a_32_byte_random_hex_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Default admin credentials — override via env in production
    DEFAULT_ADMIN_PASSWORD: str = "Sumit@123"
    DEFAULT_OPERATOR_PASSWORD: str = "Sumit@123"
    DEFAULT_VIEWER_PASSWORD: str = "Sumit@123"

    # Database
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/data/surveillance.db"

    # Storage Paths
    STORAGE_DIR: Path = BASE_DIR / "data"
    EVIDENCE_DIR: Path = BASE_DIR / "data" / "evidence"
    ENROLLED_FACES_DIR: Path = BASE_DIR / "data" / "enrolled_faces"
    MODELS_DIR: Path = BASE_DIR / "data" / "models"

    # Camera & Video Pipeline Defaults
    DEFAULT_CAMERA_SOURCE: Union[int, str] = 0
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.45
    FACE_MATCH_THRESHOLD: float = 0.60
    TRACKER_MAX_AGE_FRAMES: int = 30
    TRACKER_IOU_THRESHOLD: float = 0.30
    ENABLE_DEMO_FALLBACK: bool = True
    TARGET_FPS: int = 24

    # Security Rules & Alert Defaults
    ALERT_COOLDOWN_SECONDS: int = 15
    ENABLE_EMAIL_ALERTS: bool = False
    SMTP_HOST: str = "smtp.example.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL_RECIPIENT: str = ""

    # Rate Limiting
    LOGIN_RATE_LIMIT: str = "10/minute"

    model_config = {
        "env_file": [str(WORKSPACE_DIR / ".env"), str(BASE_DIR / ".env"), ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    def ensure_directories(self) -> None:
        """Create necessary data directories if they don't exist."""
        for path in [self.STORAGE_DIR, self.EVIDENCE_DIR, self.ENROLLED_FACES_DIR, self.MODELS_DIR]:
            path.mkdir(parents=True, exist_ok=True)

    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"


settings = Settings()
settings.ensure_directories()
