# Reproducibility Guide: v0.2.1

## Overview

AI Smart Camera v0.2.1 enforces strict dependency locking, deterministic build pipelines, and automated multi-environment verification across Google Colab, Docker, and GitHub Actions CI.

---

## 1. Pinned Dependency Architecture

### Python Requirements (`requirements.txt`)
All direct dependencies specify bounded version ranges to ensure cross-platform reproducibility between Python 3.10 and Python 3.13 without breaking on future major releases:

```txt
# Core Deep Learning & Computer Vision
torch>=2.2.0,<2.7.0
torchvision>=0.17.0,<0.30.0
ultralytics>=8.3.0,<8.4.0
supervision>=0.25.0,<0.26.0
opencv-python-headless>=4.8.0,<5.1.0
numpy>=1.24.0,<2.2.0
pillow>=10.0.0,<12.0.0

# FastAPI Backend & WebSockets
fastapi>=0.110.0,<0.142.0
uvicorn[standard]>=0.28.0,<0.35.0
python-multipart>=0.0.9,<0.1.0
websockets>=12.0,<14.0

# Optional Gradio Interface (fallback)
gradio>=5.0.0,<6.0.0

# Configuration & Validation
pydantic>=2.5.0,<3.0.0
pydantic-settings>=2.0.0,<3.0.0
pyyaml>=6.0.0,<7.0.0
requests>=2.31.0,<3.0.0
```

### Frontend Dependency Lockfile (`frontend/package-lock.json`)
The React 18 + TypeScript frontend uses an explicit `package-lock.json` committed to version control. Both CI and Docker stages execute:

```bash
npm ci
```

This guarantees bit-identical frontend build outputs regardless of when or where the project is compiled.

---

## 2. Model Weight Integrity Verification

All deep learning weights are verified via SHA-256 cryptographic hashes declared in `models/manifest.yaml`:

```yaml
models:
  yolov8n:
    format: "pytorch"
    sha256: "8e81561f67f70b7405291b8a5369fcfa2be407983637e6005c2a07505232938e"
    filesize_bytes: 6549723
  yolo11n:
    format: "pytorch"
    sha256: "9563fc9f12f2c8d2ee317ce53e20e8d3568c09a803f7e59fd23e20601bc91262"
    filesize_bytes: 5611447
```

If an in-transit corruption or upstream asset tampering occurs, `ModelLoader` immediately halts initialization and raises `ValueError`.

---

## 3. Reproduction Instructions

### Option A: Google Colab
1. Open [`notebooks/01_ai_smart_camera_colab.ipynb`](https://colab.research.google.com/github/tahadeab-ai/ai-smart-camera/blob/main/notebooks/01_ai_smart_camera_colab.ipynb).
2. Run Section 1 through Section 10 sequentially.
3. Observe all unit tests passing, frontend compiling via `npm ci`, and public HTTPS tunnel generating a live accessible demo.

### Option B: Docker Container
Build and run the production image using the multi-stage Dockerfile:

```bash
docker build -t ai-smart-camera:0.2.1 .
docker run -d -p 7860:7860 --name ai-camera-instance ai-smart-camera:0.2.1
curl http://localhost:7860/api/v1/health/live
```
