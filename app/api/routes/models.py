"""Model listing and thread-safe model switching endpoints."""

import logging
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_camera_service, verify_access_token
from app.api.schemas.system import (
    ModelInfo,
    ModelListResponse,
    ModelSwitchRequest,
    ModelSwitchResponse,
)
from app.config import settings
from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/models", tags=["Models"])


def _load_manifest_models(active_model: str) -> list[ModelInfo]:
    manifest_path = Path(settings.manifest_path)
    if not manifest_path.exists():
        return [
            ModelInfo(
                name="yolov8n",
                framework="ultralytics",
                task="detect",
                license="AGPL-3.0",
                description="YOLOv8 Nano (Default)",
                size_mb=6.2,
                checksum_sha256="f59b3d0773d32ef74e7df6874a9db4ca03ea77a941bf21d4f26dbcb748eb5047",
                is_active=(active_model == "yolov8n"),
            )
        ]

    with open(manifest_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    models_data = data.get("models", {})
    model_list = []
    for name, info in models_data.items():
        model_list.append(
            ModelInfo(
                name=name,
                framework=info.get("framework", "ultralytics"),
                task=info.get("task", "detect"),
                license=info.get("license", "AGPL-3.0"),
                description=info.get("description", ""),
                size_mb=float(info.get("size_mb", 0.0)),
                checksum_sha256=info.get("checksum_sha256", ""),
                is_active=(name == active_model),
            )
        )
    return model_list


@router.get(
    "",
    response_model=ModelListResponse,
    dependencies=[Depends(verify_access_token)],
)
async def list_models(
    camera_service: CameraService = Depends(get_camera_service),
) -> ModelListResponse:
    """Lists available supported models and designates the currently active one."""
    models = _load_manifest_models(camera_service.model_name)
    return ModelListResponse(models=models, active_model=camera_service.model_name)


@router.post(
    "/switch",
    response_model=ModelSwitchResponse,
    dependencies=[Depends(verify_access_token)],
)
async def switch_model(
    payload: ModelSwitchRequest,
    camera_service: CameraService = Depends(get_camera_service),
) -> ModelSwitchResponse:
    """Thread-safely reloads and switches the active YOLO model."""
    try:
        res = camera_service.switch_model(
            model_name=payload.model_name, device=payload.device
        )
        return ModelSwitchResponse(
            status=res["status"],
            active_model=res["model_name"],
            device=res["device"],
            classes_count=res["classes_count"],
        )
    except Exception as e:
        logger.error("Failed to switch model to '%s': %s", payload.model_name, e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MODEL_SWITCH_FAILED",
                "message": f"Could not switch to model '{payload.model_name}': {e}",
            },
        ) from e
