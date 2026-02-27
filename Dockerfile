# ── Stage 1: Builder ──
FROM python:3.13-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──
FROM python:3.13-slim

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# ML models directory (writable by appuser)
RUN mkdir -p /app/ml_models && chown appuser:appuser /app/ml_models

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/api/health')" || exit 1

# Railway PORT env variable'ini kullan, yoksa 8000
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
