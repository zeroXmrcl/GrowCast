FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN set -eux; \
    apt-get -o Acquire::Retries=5 \
        -o Acquire::http::No-Cache=true \
        -o Acquire::http::Pipeline-Depth=0 \
        update; \
    apt-get -o Acquire::Retries=5 \
        -o Acquire::http::No-Cache=true \
        -o Acquire::http::Pipeline-Depth=0 \
        install -y --no-install-recommends ffmpeg tzdata ca-certificates; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY GrowCast-Timelapse/ ./GrowCast-Timelapse/

WORKDIR /app/GrowCast-Timelapse

CMD ["python", "main.py"]
