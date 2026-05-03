# Use an official Python runtime
FROM python:3.11-slim

# Basic env
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install OCR, PDF, and PPTX conversion tools.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tesseract-ocr \
      poppler-utils \
      curl \
      libreoffice \
      libreoffice-impress \
      fonts-dejavu \
      fonts-liberation \
      fontconfig && \
    libreoffice --headless --version && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip to ensure better download resilience
RUN pip install --upgrade pip

# ---- Install CPU-only PyTorch FIRST (small & fast) ----
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir \
    --retries 10 \
    --timeout 1000 \
    --index-url ${TORCH_INDEX} \
    torch==2.4.1


# ---- Install your project deps (make sure torch is NOT in requirements.txt) ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
