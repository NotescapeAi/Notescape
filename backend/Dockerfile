# ---- Base ----
FROM python:3.11-slim

# Core env
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    FASTAPI_HOST=0.0.0.0 \
    FASTAPI_PORT=8000 \
    FASTAPI_RELOAD=false \
    FASTAPI_WORKERS=1 \
    UPLOAD_ROOT=/data/uploads \
    SENTENCE_TRANSFORMERS_HOME=/models

# Allow build-time override of the embedding model
ARG EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (cache-friendly)
COPY requirements.txt .
RUN python -m pip install --upgrade pip \
 && pip install -r requirements.txt \
 && pip install groq "sentence-transformers==2.7.0"

# Pre-download embedding model into the image to avoid runtime fetches
RUN mkdir -p ${SENTENCE_TRANSFORMERS_HOME} \
 && python - <<PY
from sentence_transformers import SentenceTransformer
m = SentenceTransformer("${EMBED_MODEL}")
print("Cached model:", m)
PY

# App code
COPY . .

# Create upload dir + non-root user
RUN mkdir -p ${UPLOAD_ROOT} && \
    groupadd -r app && useradd -r -g app app && \
    chown -R app:app /app ${UPLOAD_ROOT} ${SENTENCE_TRANSFORMERS_HOME}
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:${FASTAPI_PORT}/health || exit 1

# Start
CMD ["/bin/sh","-lc","if [ \"$FASTAPI_RELOAD\" = \"true\" ]; then \
  uvicorn app.main:app --host ${FASTAPI_HOST} --port ${FASTAPI_PORT} --reload; \
else \
  uvicorn app.main:app --host ${FASTAPI_HOST} --port ${FASTAPI_PORT} --workers ${FASTAPI_WORKERS}; \
fi"]