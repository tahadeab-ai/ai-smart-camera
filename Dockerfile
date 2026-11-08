# ==============================================================================
# Multi-stage Dockerfile for AI Smart Camera v0.2.1
# Stage 1: Build React 18 + TypeScript + Vite SPA
# Stage 2: Production Python 3.11-slim FastAPI + Computer Vision Runtime
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Build
# ------------------------------------------------------------------------------
FROM node:20-slim AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Backend & Production Runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1

# Install essential system dependencies for OpenCV and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libxcb1 \
    libx11-6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged system user for secure container execution
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source, models manifest, and configurations
COPY app/ ./app/
COPY models/manifest.yaml ./models/manifest.yaml
COPY pyproject.toml .

# Copy compiled React frontend assets from Stage 1
COPY --from=frontend-builder /build/dist ./frontend/dist

# Create cache directory with correct unprivileged ownership
RUN mkdir -p /app/models/weights && chown -R appuser:appuser /app

USER appuser

EXPOSE 7860

# FastAPI Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:7860/api/v1/health/live || exit 1

ENTRYPOINT ["python", "-m", "app.main"]
CMD ["--host", "0.0.0.0", "--port", "7860"]
