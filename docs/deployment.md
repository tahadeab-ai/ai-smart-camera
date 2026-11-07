# Deployment Guide: Google Colab & Docker Containerization

This guide provides instructions for deploying the **AI Smart Camera** across two primary target platforms: **Google Colab** and **Docker**.

---

## 1. Google Colab Deployment (Primary Interactive Runtime)

Google Colab provides an instant cloud environment with optional GPU acceleration.

### Quick Start via Colab Badge
Click the badge in the project README or open:
`https://colab.research.google.com/github/tahadeab-ai/ai-smart-camera/blob/main/notebooks/01_ai_smart_camera_colab.ipynb`

### Execution Workflow
1. Select **Runtime -> Run all** or step through the notebook sequentially.
2. In Section 1, confirm hardware resources (GPU or CPU).
3. In Section 7, the application launches with `demo.launch(share=True)`.
4. A public URL formatted like `https://xxxx.gradio.live` will appear.
5. Open the link on any desktop browser or mobile phone (iOS Safari / Android Chrome) to stream the camera feed.

---

## 2. Docker Deployment (Future Local or Cloud Server)

The application includes a production-ready, multi-stage `Dockerfile` and `compose.yaml` configured for CPU execution with non-root security.

### Prerequisites
- Docker Engine 24.0+ and Docker Compose v2.

### Step-by-Step Container Deployment

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tahadeab-ai/ai-smart-camera.git
   cd ai-smart-camera
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. **Build and Run with Docker Compose**:
   ```bash
   docker compose up --build -d
   ```

4. **Verify Container Health**:
   ```bash
   docker compose ps
   docker compose logs -f ai-smart-camera
   ```

5. **Access Interface**:
   Open `http://localhost:7860` in your web browser.

6. **Stop Container**:
   ```bash
   docker compose down
   ```

### Architecture of the Container
- **Base**: `python:3.11-slim`
- **User**: Unprivileged `appuser` (UID 1000)
- **Port**: `7860`
- **Volume**: `ai_smart_camera_model_cache` mounted at `/app/models/weights` to persist model weights across container restarts.
- **Healthcheck**: Automated polling of `http://localhost:7860/` every 30 seconds.
