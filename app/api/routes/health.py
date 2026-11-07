"""Health and readiness check endpoints."""

import time
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import _camera_service
from app.api.schemas.system import HealthResponse

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    """Kubernetes / Docker liveness probe: returns 200 if the process is responsive."""
    return HealthResponse(
        status="ok",
        version="0.2.0",
        timestamp=time.time(),
    )


@router.get("/ready", response_model=HealthResponse)
async def readiness() -> HealthResponse:
    """Readiness probe: returns 200 only when the model and camera service are loaded."""
    if _camera_service is None or _camera_service.model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "NOT_READY", "message": "Model is still loading."},
        )
    return HealthResponse(
        status="ready",
        version="0.2.0",
        timestamp=time.time(),
    )
