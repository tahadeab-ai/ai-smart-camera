"""System telemetry and hardware resource monitoring."""

import os
import platform
import sys

import torch
from fastapi import APIRouter, Depends

from app.api.dependencies import get_camera_service, verify_access_token
from app.api.schemas.system import SystemInfoResponse
from app.services.camera_service import CameraService
from app.services.stream_manager import stream_manager

router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/info",
    response_model=SystemInfoResponse,
    dependencies=[Depends(verify_access_token)],
)
async def get_system_info(
    camera_service: CameraService = Depends(get_camera_service),
) -> SystemInfoResponse:
    """Returns runtime telemetry, PyTorch version, CUDA status, and active streams."""
    cuda_available = torch.cuda.is_available()

    # Optional memory stats
    memory_total_gb = None
    memory_avail_gb = None
    try:
        import psutil

        mem = psutil.virtual_memory()
        memory_total_gb = round(mem.total / (1024**3), 2)
        memory_avail_gb = round(mem.available / (1024**3), 2)
    except ImportError:
        pass

    return SystemInfoResponse(
        platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
        python_version=sys.version.split()[0],
        torch_version=torch.__version__,
        cuda_available=cuda_available,
        device=camera_service.device,
        active_model=camera_service.model_name,
        cpu_count=os.cpu_count() or 1,
        memory_total_gb=memory_total_gb,
        memory_available_gb=memory_avail_gb,
        active_stream_count=stream_manager.active_count,
    )
