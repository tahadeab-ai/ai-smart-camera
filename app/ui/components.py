"""Reusable UI presentation components and styling for Gradio interface."""

import gradio as gr


def header_component() -> gr.HTML:
    """Renders the top application hero header with responsive design."""
    return gr.HTML(
        """
        <div style="text-align: center; padding: 20px 10px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; margin-bottom: 16px; color: white;">
            <h1 style="margin: 0 0 8px 0; font-size: 2.2rem; font-weight: 700; letter-spacing: -0.5px;">
                👁️ AI Smart Camera
            </h1>
            <p style="margin: 0; font-size: 1.05rem; color: #94a3b8;">
                Real-Time Computer Vision Object Detection & Counting
            </p>
            <div style="margin-top: 10px; display: inline-flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                <span style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 3px 10px; border-radius: 9999px; font-size: 0.8rem; border: 1px solid rgba(59, 130, 246, 0.3);">Ultralytics YOLO</span>
                <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 10px; border-radius: 9999px; font-size: 0.8rem; border: 1px solid rgba(16, 185, 129, 0.3);">Roboflow Supervision</span>
                <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 3px 10px; border-radius: 9999px; font-size: 0.8rem; border: 1px solid rgba(245, 158, 11, 0.3);">Mobile-Ready</span>
            </div>
        </div>
        """
    )


def privacy_banner() -> gr.HTML:
    """Renders a mandatory security and privacy disclosure banner."""
    return gr.HTML(
        """
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 10px 14px; margin-bottom: 16px; border-radius: 4px; font-size: 0.85rem; color: #334155;">
            <strong>🔒 Privacy & Streaming Notice:</strong> All camera frames and uploaded images are processed strictly in volatile system memory. No footage or images are stored on server disks. Public Gradio share URLs are intended for temporary demonstration.
        </div>
        """
    )


def statistics_card(total_count: int = 0, latency_ms: float = 0.0) -> gr.HTML:
    """Renders high-contrast metric badges."""
    return gr.HTML(
        f"""
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Detected Objects</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: #0f172a;" id="metric-total">{total_count}</div>
            </div>
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase;">Inference Latency</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: #0284c7;" id="metric-latency">{latency_ms:.1f} <span style="font-size: 1rem; font-weight: 500;">ms</span></div>
            </div>
        </div>
        """
    )
