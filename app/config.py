"""Application configuration using Pydantic Settings."""

from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """Central configuration for AI Smart Camera application."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server Configuration
    app_host: str = "0.0.0.0"
    app_port: int = 7860
    gradio_share: bool = False

    # Model Configuration
    model_name: str = "yolov8n"
    model_cache_dir: Path = Path("./models/weights")
    manifest_path: Path = Path("./models/manifest.yaml")
    device: str = "cpu"  # 'cpu', 'cuda', 'cuda:0', 'mps'

    # Inference Thresholds
    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45
    image_max_size: int = 1280

    # Camera & Stream Settings
    camera_stream_fps: int = 10
    frame_skip_interval: int = 1  # 1 = process every frame, 2 = every 2nd frame
    stream_every_seconds: float = 0.1

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


# Global singleton instance
settings = AppSettings()
