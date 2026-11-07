"""Main application entry point for AI Smart Camera (FastAPI & optional Gradio debug UI)."""

import argparse
import logging
import sys

import torch
import uvicorn

from app.config import settings
from app.services.camera_service import CameraService
from app.ui.gradio_app import APP_CSS, APP_THEME, create_gradio_app

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("ai_smart_camera")


def parse_args() -> argparse.Namespace:
    """Parses command-line arguments overriding environment configuration."""
    parser = argparse.ArgumentParser(
        description="AI Smart Camera v0.2.0 - FastAPI Backend & Real-time Vision"
    )
    parser.add_argument("--host", type=str, default=settings.app_host, help="Host address to bind")
    parser.add_argument("--port", type=int, default=settings.app_port, help="Port to listen on")
    parser.add_argument(
        "--gradio",
        action="store_true",
        default=False,
        help="Launch the legacy/debug Gradio interface instead of FastAPI",
    )
    parser.add_argument(
        "--share",
        action="store_true",
        default=settings.gradio_share,
        help="Create a public Gradio URL (only when --gradio is set)",
    )
    parser.add_argument("--model", type=str, default=settings.model_name, help="YOLO model identifier")
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Inference device (cpu, cuda, mps)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=False,
        help="Enable uvicorn auto-reload for local development",
    )
    return parser.parse_args()


def run_app() -> None:
    """Initializes services and launches the FastAPI or Gradio application."""
    args = parse_args()

    # Optional Fallback: Gradio debug UI
    if args.gradio:
        logger.info(
            "Launching AI Smart Camera in Gradio mode (model: %s, device: %s)...",
            args.model,
            args.device,
        )
        camera_service = CameraService(
            model_name=args.model,
            device=args.device,
            confidence_threshold=settings.confidence_threshold,
            iou_threshold=settings.iou_threshold,
        )
        demo = create_gradio_app(camera_service=camera_service)
        demo.launch(
            server_name=args.host,
            server_port=args.port,
            share=args.share,
            theme=APP_THEME,
            css=APP_CSS,
            show_error=True,
        )
        return

    # Default Mode: Production FastAPI Backend
    logger.info(
        "Launching AI Smart Camera v0.2.0 FastAPI server on %s:%s (device: %s)...",
        args.host,
        args.port,
        args.device,
    )
    uvicorn.run(
        "app.api.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run_app()
