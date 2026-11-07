"""FastAPI dependency injection and authentication helpers."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status

from app.config import settings
from app.services.camera_service import CameraService

# Global service instance initialized during app lifespan
_camera_service: CameraService | None = None


def set_camera_service(service: CameraService) -> None:
    """Sets the global camera service during application startup."""
    global _camera_service
    _camera_service = service


def get_camera_service() -> CameraService:
    """Dependency provider returning the initialized CameraService."""
    if _camera_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Camera service is not ready."},
        )
    return _camera_service


async def verify_access_token(
    x_access_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
) -> bool:
    """Verifies optional access token for public Colab tunnels.

    If settings.access_token is None or empty, access is public.
    """
    expected = settings.access_token
    if not expected:
        return True

    provided = x_access_token or token
    if not provided and authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()

    if provided != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNAUTHORIZED",
                "message": "Invalid or missing access token for this deployment.",
            },
        )
    return True
