# Multi-stage Dockerfile for AI Smart Camera (CPU-compatible production image)
FROM python:3.11-slim as base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1

# Install essential system dependencies for OpenCV and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged system user for secure container execution
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source and metadata
COPY app/ ./app/
COPY models/manifest.yaml ./models/manifest.yaml
COPY pyproject.toml .

# Create cache directory with correct ownership
RUN mkdir -p /app/models/weights && chown -R appuser:appuser /app

USER appuser

EXPOSE 7860

# Gradio healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:7860/ || exit 1

ENTRYPOINT ["python", "-m", "app.main"]
CMD ["--host", "0.0.0.0", "--port", "7860"]
