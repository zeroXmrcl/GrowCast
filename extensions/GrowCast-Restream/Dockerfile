FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
        fonts-liberation \
        python3 \
        xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 growcast \
    && useradd -u 1001 -g 1001 -m growcast

WORKDIR /app
COPY restream.py /app/restream.py
RUN chown growcast:growcast /app/restream.py

ENV DISPLAY=:99
USER 1001:1001
CMD ["python3", "-u", "/app/restream.py"]
