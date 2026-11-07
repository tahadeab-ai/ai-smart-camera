"""Schemas for object detection and WebSocket streaming."""

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Normalized or pixel coordinate bounding box."""

    x1: float = Field(..., description="Top-left X coordinate")
    y1: float = Field(..., description="Top-left Y coordinate")
    x2: float = Field(..., description="Bottom-right X coordinate")
    y2: float = Field(..., description="Bottom-right Y coordinate")
    confidence: float = Field(..., description="Detection confidence score between 0.0 and 1.0")
    class_id: int = Field(..., description="COCO or dataset class ID")
    class_name: str = Field(..., description="Human-readable category name")


class DetectionStats(BaseModel):
    """Aggregate statistics for detected objects."""

    total_count: int = Field(..., description="Total number of detected objects")
    class_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts broken down per category"
    )


class ImageDetectionResponse(BaseModel):
    """Comprehensive response for static image inference."""

    annotated_image: str = Field(..., description="Base64 encoded JPEG data URI")
    detections: list[BoundingBox] = Field(..., description="Detected bounding boxes")
    stats: DetectionStats = Field(..., description="Object counts")
    latency_ms: float = Field(..., description="Inference and annotation latency in milliseconds")
    model_name: str = Field(..., description="Model identifier used for inference")
    device: str = Field(..., description="Execution device (e.g. cpu, cuda:0)")
    image_width: int
    image_height: int


class StreamClientConfig(BaseModel):
    """Configuration message sent by WebSocket client."""

    type: str = Field(default="config")
    confidence_threshold: float = Field(default=0.25, ge=0.01, le=1.0)
    iou_threshold: float = Field(default=0.45, ge=0.01, le=1.0)
    filter_classes: list[str] = Field(default_factory=list)
    skip_interval: int = Field(default=1, ge=1, le=10)
    return_annotated_frame: bool = Field(default=True)
    jpeg_quality: int = Field(default=75, ge=10, le=100)


class StreamMetadata(BaseModel):
    """Real-time metadata returned per frame over WebSocket."""

    type: str = Field(default="detection")
    frame_id: int
    timestamp: float
    latency_ms: float
    fps: float
    stats: DetectionStats
    detections: list[BoundingBox]
    skipped: bool = False
