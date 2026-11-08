"""FastAPI application factory, lifespan management, middleware, and SPA routing."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.dependencies import set_camera_service
from app.api.routes.auth import router as auth_router
from app.api.routes.detection import router as detection_router
from app.api.routes.health import router as health_router
from app.api.routes.models import router as models_router
from app.api.routes.system import router as system_router
from app.api.websockets.camera_stream import router as ws_router
from app.config import settings
from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manages application startup and shutdown lifecycle."""
    logger.info("Initializing AI Smart Camera core services...")
    # Initialize and warm up the camera service singleton
    service = CameraService(
        model_name=settings.model_name,
        device=settings.device,
        confidence_threshold=settings.confidence_threshold,
        iou_threshold=settings.iou_threshold,
    )
    set_camera_service(service)
    logger.info(
        "Camera service initialized with model '%s' on '%s'.",
        service.model_name,
        service.device,
    )
    yield
    logger.info("Shutting down AI Smart Camera services...")


class ContentSizeLimitMiddleware:
    """ASGI-level request body size limit to reject oversized payloads before multipart parsing."""

    def __init__(self, app, max_upload_size_bytes: int) -> None:
        self.app = app
        self.max_upload_size_bytes = max_upload_size_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            content_length = None
            for name, value in scope.get("headers", []):
                if name.lower() == b"content-length":
                    try:
                        content_length = int(value.decode("latin-1"))
                    except ValueError:
                        pass
                    break

            if content_length is not None and content_length > self.max_upload_size_bytes:
                response = JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": f"Request body ({content_length} bytes) exceeds maximum limit of {self.max_upload_size_bytes} bytes.",
                        }
                    },
                )
                await response(scope, receive, send)
                return

            bytes_received = 0

            async def custom_receive():
                nonlocal bytes_received
                message = await receive()
                if message["type"] == "http.request":
                    body = message.get("body", b"")
                    bytes_received += len(body)
                    if bytes_received > self.max_upload_size_bytes:
                        err_res = JSONResponse(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            content={
                                "error": {
                                    "code": "PAYLOAD_TOO_LARGE",
                                    "message": f"Request body stream exceeds maximum limit of {self.max_upload_size_bytes} bytes.",
                                }
                            },
                        )
                        await err_res(scope, receive, send)
                        return {"type": "http.disconnect"}
                return message

            await self.app(scope, custom_receive, send)
            return

        await self.app(scope, receive, send)


def create_app() -> FastAPI:
    """Builds and configures the FastAPI application."""
    app = FastAPI(
        title="AI Smart Camera API",
        description="High-performance edge-ready Computer Vision backend with YOLO, Supervision, and WebSockets.",
        version="0.2.2",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    # Enforce ASGI-level max body size limit (settings.max_upload_size_mb)
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    app.add_middleware(ContentSizeLimitMiddleware, max_upload_size_bytes=max_bytes)

    # CORS configuration for cross-origin local development and Colab tunneling
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Standardized Exception Handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            error_obj = detail
        else:
            error_obj = {
                "code": f"HTTP_{exc.status_code}",
                "message": str(detail),
                "details": None,
            }
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": error_obj},
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred.",
                    "details": str(exc),
                }
            },
        )

    # Wire API routers under /api/v1 prefix
    api_v1_prefix = "/api/v1"
    app.include_router(health_router, prefix=api_v1_prefix)
    app.include_router(auth_router, prefix=api_v1_prefix)
    app.include_router(system_router, prefix=api_v1_prefix)
    app.include_router(models_router, prefix=api_v1_prefix)
    app.include_router(detection_router, prefix=api_v1_prefix)
    app.include_router(ws_router, prefix=api_v1_prefix)

    # Mount static assets & Single Page Application (SPA) fallback
    dist_dir = Path(settings.static_dir).resolve()
    assets_dir = dist_dir / "assets"

    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_or_fallback(full_path: str):
        # Do not catch API or docs routes
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
            raise HTTPException(status_code=404, detail="Not Found")

        # Check if direct file exists in dist
        file_path = dist_dir / full_path
        if file_path.is_file():
            if file_path.name == "index.html":
                return FileResponse(
                    file_path,
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
                )
            return FileResponse(file_path)

        # Fallback to index.html for SPA client-side routing
        index_file = dist_dir / "index.html"
        if index_file.is_file():
            return FileResponse(
                index_file,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )

        # Fallback if frontend has not been compiled yet
        return HTMLResponse(
            content="""<!DOCTYPE html>
<html>
<head><title>AI Smart Camera v0.2.2</title>
<style>
body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
.card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 520px; text-align: center; border: 1px solid #334155; }
h1 { color: #38bdf8; margin-top: 0; }
a { color: #38bdf8; text-decoration: none; font-weight: 600; }
a:hover { text-decoration: underline; }
.badge { background: #0369a1; color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="card">
  <h1>AI Smart Camera <span class="badge">v0.2.2</span></h1>
  <p>FastAPI backend is running and ready.</p>
  <p>Explore the interactive API documentation at <a href="/docs">/docs</a> or <a href="/redoc">/redoc</a>.</p>
  <p><small style="color: #94a3b8;">Compile the React frontend into <code>frontend/dist</code> to view the full web application interface.</small></p>
</div>
</body>
</html>
""",
            status_code=200,
        )

    return app


# Default app instance
app = create_app()
