"""Static image detection API endpoint."""

import base64
import logging

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.dependencies import get_camera_service, verify_access_token
from app.api.schemas.detection import (
    BoundingBox,
    DetectionStats,
    ImageDetectionResponse,
)
from app.config import settings
from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detect", tags=["Detection"])


@router.post(
    "/image",
    response_model=ImageDetectionResponse,
    dependencies=[Depends(verify_access_token)],
)
async def detect_image(
    file: UploadFile = File(..., description="Uploaded image file (JPEG, PNG, WebP)"),
    confidence: float = Form(0.25, ge=0.01, le=1.0),
    iou_threshold: float = Form(0.45, ge=0.01, le=1.0),
    filter_classes: str | None = Form(
        None, description="Comma-separated class names to filter, e.g. 'person,car'"
    ),
    camera_service: CameraService = Depends(get_camera_service),
) -> ImageDetectionResponse:
    """Performs object detection on an uploaded static image."""
    # Enforce file upload size limit
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"Image exceeds maximum upload size of {settings.max_upload_size_mb}MB",
            },
        )

    # Decode image bytes
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

    rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
    h, w = rgb_image.shape[:2]

    # Parse filter classes
    parsed_classes = None
    if filter_classes:
        parsed_classes = [c.strip() for c in filter_classes.split(",") if c.strip()]

    try:
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
        success, encoded_jpg = cv2.imencode(
            ".jpg", annotated_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85]
        )
        if not success:
            raise RuntimeError("Failed to encode annotated image to JPEG.")

        b64_str = base64.b64encode(encoded_jpg.tobytes()).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64_str}"

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
    except Exception as e:
        logger.error("Inference failure on uploaded image: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INFERENCE_ERROR", "message": f"Detection failed: {e}"},
        )
