"""Schemas for health, system status, and model metadata."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str = Field(..., example="ok")
    version: str = Field(..., example="0.2.0")
    timestamp: float = Field(..., description="UNIX epoch timestamp")


class SystemInfoResponse(BaseModel):
    """Hardware and environment telemetry."""

    platform: str
    python_version: str
    torch_version: str
    cuda_available: bool
    device: str
    active_model: str
    cpu_count: int
    memory_total_gb: float | None = None
    memory_available_gb: float | None = None
    active_stream_count: int


class ModelInfo(BaseModel):
    """Metadata for an available YOLO model."""

    name: str
    framework: str
    task: str
    license: str
    description: str
    size_mb: float
    checksum_sha256: str
    is_active: bool


class ModelListResponse(BaseModel):
    """List of supported models and active state."""

    models: list[ModelInfo]
    active_model: str


class ModelSwitchRequest(BaseModel):
    """Payload to request an active model swap."""

    model_name: str = Field(..., example="yolo11n")
    device: str | None = Field(default=None, example="cpu")


class ModelSwitchResponse(BaseModel):
    """Result of model switch operation."""

    status: str
    active_model: str
    device: str
    classes_count: int


class VersionResponse(BaseModel):
    """Application version and git commit metadata."""

    version: str = Field(..., example="0.2.2")
    commit_sha: str = Field(..., example="a46c046")

