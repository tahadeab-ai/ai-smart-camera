"""Main application entry point for AI Smart Camera."""

import argparse
import logging
import sys

import torch

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
    parser = argparse.ArgumentParser(description="AI Smart Camera - Real-time Object Detection")
    parser.add_argument("--host", type=str, default=settings.app_host, help="Host address to bind")
    parser.add_argument("--port", type=int, default=settings.app_port, help="Port to listen on")
    parser.add_argument("--share", action="store_true", default=settings.gradio_share, help="Create a public Gradio URL")
    parser.add_argument("--model", type=str, default=settings.model_name, help="YOLO model identifier")
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Inference device (cpu, cuda, mps)",
    )
    return parser.parse_args()


def run_app() -> None:
    """Initializes services and launches the Gradio user interface."""
    args = parse_args()
    logger.info("Initializing AI Smart Camera with model: %s on device: %s", args.model, args.device)

    camera_service = CameraService(
        model_name=args.model,
        device=args.device,
        confidence_threshold=settings.confidence_threshold,
        iou_threshold=settings.iou_threshold,
    )

    demo = create_gradio_app(camera_service=camera_service)

    logger.info("Launching Gradio interface on %s:%s (share=%s)...", args.host, args.port, args.share)
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        theme=APP_THEME,
        css=APP_CSS,
        show_error=True,
    )


if __name__ == "__main__":
    run_app()
