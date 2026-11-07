"""Gradio Web Application assembly with Live Webcam and Static Image Detection."""

import logging

import gradio as gr
import numpy as np

from app.services.camera_service import CameraService
from app.ui.components import header_component, privacy_banner
from app.vision.counter import ObjectCounter

logger = logging.getLogger(__name__)


APP_THEME = gr.themes.Soft(primary_hue="blue", secondary_hue="slate")
APP_CSS = """
.gradio-container { max-width: 1200px !important; margin: auto; }
.tab-panel { padding: 12px 0; }
footer { visibility: hidden !important; }
"""


def create_gradio_app(camera_service: CameraService) -> gr.Blocks:
    """Builds and wires the full Gradio Blocks web application."""

    # Extract available class names for filter dropdown
    available_classes = sorted(camera_service.detector.class_names.values())

    with gr.Blocks(title="AI Smart Camera | Computer Vision MVP") as demo:
        header_component()
        privacy_banner()

        with gr.Tabs():
            # ==============================================================
            # TAB 1: LIVE WEBCAM STREAM
            # ==============================================================
            with gr.TabItem("📹 Live Web Camera", id="tab_webcam"):
                gr.Markdown(
                    "Stream video directly from your **mobile phone** or **desktop webcam**. "
                    "Frames are processed in real-time in memory."
                )

                with gr.Row():
                    with gr.Column(scale=3):
                        # Live video streaming component
                        camera_input = gr.Image(
                            sources=["webcam"],
                            streaming=True,
                            type="numpy",
                            label="Camera Feed (Click to start/allow permission)",
                        )
                    with gr.Column(scale=3):
                        camera_output = gr.Image(
                            type="numpy",
                            label="Annotated AI Stream",
                            interactive=False,
                        )

                with gr.Row():
                    with gr.Column(scale=2):
                        stream_conf_slider = gr.Slider(
                            minimum=0.10,
                            maximum=0.95,
                            value=0.25,
                            step=0.05,
                            label="Confidence Threshold",
                        )
                        stream_skip_slider = gr.Slider(
                            minimum=1,
                            maximum=4,
                            value=1,
                            step=1,
                            label="Frame Skipping (1 = Every frame, 2 = Every 2nd frame for smooth mobile)",
                        )
                    with gr.Column(scale=4):
                        stream_stats_markdown = gr.Markdown(
                            "**Detection Stats:** Waiting for camera feed...",
                        )
                        stream_latency_markdown = gr.Markdown(
                            "**Latency:** `0.0 ms`",
                        )

                # Frame processing function for streaming
                def on_camera_stream(
                    frame: np.ndarray,
                    conf: float,
                    skip: int,
                ) -> tuple[np.ndarray, str, str]:
                    if frame is None:
                        return (
                            np.zeros((360, 480, 3), dtype=np.uint8),
                            "**Detection Stats:** No video signal.",
                            "**Latency:** `0.0 ms`",
                        )

                    annotated, stats, latency_ms = camera_service.process_frame(
                        frame=frame,
                        confidence_threshold=conf,
                        skip_interval=int(skip),
                    )

                    stats_md = ObjectCounter.format_markdown_table(stats)
                    latency_md = f"**Inference Latency:** `{latency_ms:.1f} ms` | **Device:** `{camera_service.device.upper()}`"
                    return annotated, stats_md, latency_md

                # Connect stream event
                camera_input.stream(
                    fn=on_camera_stream,
                    inputs=[camera_input, stream_conf_slider, stream_skip_slider],
                    outputs=[camera_output, stream_stats_markdown, stream_latency_markdown],
                    stream_every=0.1,  # ~10 FPS max throttle
                    show_progress="hidden",
                )

            # ==============================================================
            # TAB 2: IMAGE UPLOAD
            # ==============================================================
            with gr.TabItem("🖼️ Image Upload & Analysis", id="tab_upload"):
                gr.Markdown(
                    "Upload high-resolution photos (**JPG, JPEG, PNG**) for precise object detection and counting."
                )

                with gr.Row():
                    with gr.Column(scale=3):
                        image_input = gr.Image(
                            type="numpy",
                            label="Upload Source Image",
                            sources=["upload"],
                        )
                    with gr.Column(scale=3):
                        image_output = gr.Image(
                            type="numpy",
                            label="Detection Results",
                            interactive=False,
                        )

                with gr.Row():
                    with gr.Column(scale=2):
                        upload_conf_slider = gr.Slider(
                            minimum=0.05,
                            maximum=0.95,
                            value=0.25,
                            step=0.05,
                            label="Confidence Threshold",
                        )
                        upload_iou_slider = gr.Slider(
                            minimum=0.10,
                            maximum=0.90,
                            value=0.45,
                            step=0.05,
                            label="NMS IoU Threshold",
                        )
                        if available_classes:
                            upload_class_filter = gr.Dropdown(
                                choices=available_classes,
                                multiselect=True,
                                label="Filter Classes (leave empty to detect all)",
                            )
                        else:
                            upload_class_filter = gr.State(None)

                        detect_btn = gr.Button("🔍 Run Object Detection", variant="primary")

                    with gr.Column(scale=4):
                        upload_stats_display = gr.Markdown(
                            "**Detection Stats:** Upload an image and click 'Run Object Detection'",
                        )
                        upload_latency_display = gr.Markdown(
                            "**Inference Latency:** `-- ms`",
                        )

                def on_image_detect(
                    img: np.ndarray,
                    conf: float,
                    iou: float,
                    classes: list[str] | None,
                ) -> tuple[np.ndarray | None, str, str]:
                    if img is None:
                        return None, "⚠️ Please upload an image first.", "**Latency:** `-- ms`"

                    try:
                        _, annotated, stats, latency_ms = camera_service.process_image(
                            image_input=img,
                            confidence_threshold=conf,
                            iou_threshold=iou,
                            filter_classes=classes if classes else None,
                        )
                        stats_md = ObjectCounter.format_markdown_table(stats)
                        latency_md = f"⏱️ **Inference Latency:** `{latency_ms:.1f} ms` | **Device:** `{camera_service.device.upper()}`"
                        return annotated, stats_md, latency_md
                    except Exception as e:
                        logger.error("Image detection error: %s", e)
                        return None, f"❌ **Error:** {e}", "**Latency:** `Error`"

                detect_btn.click(
                    fn=on_image_detect,
                    inputs=[image_input, upload_conf_slider, upload_iou_slider, upload_class_filter],
                    outputs=[image_output, upload_stats_display, upload_latency_display],
                )

            # ==============================================================
            # TAB 3: MODEL CARD & SYSTEM METRICS
            # ==============================================================
            with gr.TabItem("ℹ️ Model & System Information", id="tab_info"):
                meta = camera_service.metadata
                gr.Markdown(
                    f"""
                    ### 🤖 Active Computer Vision Architecture
                    - **Model Name:** `{meta.get('name', camera_service.model_name)}`
                    - **Architecture:** `{meta.get('architecture', 'YOLO')}`
                    - **Weight File:** `{meta.get('filename', 'yolov8n.pt')}`
                    - **Supported Classes:** `{meta.get('classes_count', 80)} COCO categories`
                    - **Inference Runtime Device:** `{camera_service.device.upper()}`
                    - **License:** `{meta.get('license', 'AGPL-3.0')}`
                    - **Official Source:** [{meta.get('source', 'Ultralytics')}]({meta.get('source', '#')})

                    ---

                    ### 📐 Pipeline Architecture
                    ```
                    [Client Webcam / Upload]
                              │
                              ▼
                     Gradio Web Engine (v6)
                              │
                              ▼
                     CameraService Orchestrator
                              │
                              ▼
                     YOLO PyTorch Engine (Ultralytics)
                              │
                              ▼
                     Roboflow Supervision (Detections)
                              │
                              ▼
                     Annotator (Boxes & Labels) + Counter
                              │
                              ▼
                     Real-Time Rendered Canvas
                    ```
                    """
                )

    return demo
