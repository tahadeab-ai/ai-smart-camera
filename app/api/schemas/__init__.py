"""Pydantic schemas for the AI Smart Camera API."""

from app.api.schemas.common import ErrorDetail, ErrorResponse
from app.api.schemas.detection import (
    BoundingBox,
    DetectionStats,
    ImageDetectionResponse,
    StreamClientConfig,
    StreamMetadata,
)
from app.api.schemas.system import (
    HealthResponse,
    ModelInfo,
    ModelListResponse,
    ModelSwitchRequest,
    ModelSwitchResponse,
    SystemInfoResponse,
)

__all__ = [
    "ErrorDetail",
    "ErrorResponse",
    "BoundingBox",
    "DetectionStats",
    "ImageDetectionResponse",
    "StreamClientConfig",
    "StreamMetadata",
    "HealthResponse",
    "ModelInfo",
    "ModelListResponse",
    "ModelSwitchRequest",
    "ModelSwitchResponse",
    "SystemInfoResponse",
]
