"""Static image detection API endpoint with robust security and bounding checks."""

import base64
import logging

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_camera_service, verify_access_token
from app.api.schemas.detection import (
    BoundingBox,
    DetectionStats,
    ImageDetectionResponse,
)
from app.config import settings
from app.services.camera_service import CameraService
from app.services.rate_limiter import image_rate_limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detect", tags=["Detection"])

# Format magic byte constants
JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
WEBP_RIFF = b"RIFF"
WEBP_MAGIC = b"WEBP"

MIN_DIMENSION = 10
MAX_DIMENSION = 4096
STREAM_CHUNK_SIZE = 64 * 1024  # 64 KB chunks


def validate_image_magic(data: bytes) -> str:
    """Validates image magic bytes. Returns detected format or raises HTTPException."""
    if len(data) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE_FORMAT",
                "message": "File too small to contain a valid image header.",
            },
        )
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    if data.startswith(PNG_MAGIC):
        return "png"
    if data.startswith(WEBP_RIFF) and data[8:12] == WEBP_MAGIC:
        return "webp"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "INVALID_IMAGE_FORMAT",
            "message": "Unsupported image format. Allowed formats are JPEG, PNG, and WebP.",
        },
    )


def _sync_decode_and_infer(
    content: bytes,
    camera_service: CameraService,
    confidence: float,
    iou_threshold: float,
    parsed_classes: list[str] | None,
) -> tuple[str, list[dict], dict, float, int, int]:
    """Synchronous CPU/GPU-bound image decoding, inference, and annotation."""
    np_arr = np.frombuffer(content, np.uint8)
    bgr_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if bgr_image is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE",
                "message": "Could not decode uploaded file as an image.",
            },
        )

    h, w = bgr_image.shape[:2]
    if w < MIN_DIMENSION or h < MIN_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE_DIMENSIONS",
                "message": f"Image dimensions too small ({w}x{h}). Minimum supported is {MIN_DIMENSION}x{MIN_DIMENSION}.",
            },
        )
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE_DIMENSIONS",
                "message": f"Image dimensions too large ({w}x{h}). Maximum supported is {MAX_DIMENSION}x{MAX_DIMENSION}.",
            },
        )

    rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

    (
        _,
        annotated_rgb,
        boxes_data,
        stats_data,
        latency_ms,
    ) = camera_service.process_image_detailed(
        image_input=rgb_image,
        confidence_threshold=confidence,
        iou_threshold=iou_threshold,
        filter_classes=parsed_classes,
    )

    # Encode annotated image to JPEG base64 data URI
    annotated_bgr = cv2.cvtColor(annotated_rgb, cv2.COLOR_RGB2BGR)
    success, encoded_jpg = cv2.imencode(".jpg", annotated_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        raise RuntimeError("Failed to encode annotated image to JPEG.")

    b64_str = base64.b64encode(encoded_jpg.tobytes()).decode("utf-8")
    data_uri = f"data:image/jpeg;base64,{b64_str}"

    return data_uri, boxes_data, stats_data, latency_ms, w, h


@router.post(
    "/image",
    response_model=ImageDetectionResponse,
    dependencies=[Depends(verify_access_token)],
)
async def detect_image(
    request: Request,
    file: UploadFile = File(..., description="Uploaded image file (JPEG, PNG, WebP)"),
    confidence: float = Form(0.25, ge=0.01, le=1.0),
    iou_threshold: float = Form(0.45, ge=0.01, le=1.0),
    filter_classes: str | None = Form(
        None, description="Comma-separated class names to filter, e.g. 'person,car'"
    ),
    camera_service: CameraService = Depends(get_camera_service),
) -> ImageDetectionResponse:
    """Performs object detection on an uploaded static image with secure streaming and bounded size checks."""
    image_rate_limiter.check(request)
    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    # 1. Early Content-Length check
    content_length_header = request.headers.get("content-length")
    if content_length_header:
        try:
            if int(content_length_header) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": f"Image exceeds maximum upload size of {settings.max_upload_size_mb}MB",
                    },
                )
        except ValueError:
            pass

    # 2. Bounded chunk streaming to avoid memory exhaustion
    chunks: list[bytes] = []
    total_bytes = 0

    try:
        while True:
            chunk = await file.read(STREAM_CHUNK_SIZE)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": f"Image exceeds maximum upload size of {settings.max_upload_size_mb}MB",
                    },
                )
            chunks.append(chunk)

        content = b"".join(chunks)

        # 3. Magic byte validation
        validate_image_magic(content)

        # 4. Parse filter classes
        parsed_classes = None
        if filter_classes:
            parsed_classes = [c.strip() for c in filter_classes.split(",") if c.strip()]

        # 5. Non-blocking threadpool execution for CPU/GPU-bound decode & inference
        (
            data_uri,
            boxes_data,
            stats_data,
            latency_ms,
            w,
            h,
        ) = await run_in_threadpool(
            _sync_decode_and_infer,
            content,
            camera_service,
            confidence,
            iou_threshold,
            parsed_classes,
        )

        boxes = [BoundingBox(**b) for b in boxes_data]
        stats = DetectionStats(
            total_count=stats_data.get("total_count", 0),
            class_counts=stats_data.get("class_counts", {}),
        )

        return ImageDetectionResponse(
            annotated_image=data_uri,
            detections=boxes,
            stats=stats,
            latency_ms=round(latency_ms, 2),
            model_name=camera_service.model_name,
            device=camera_service.device,
            image_width=w,
            image_height=h,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Inference failure on uploaded image: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INFERENCE_ERROR", "message": f"Detection failed: {e}"},
        ) from e
    finally:
        await file.close()
