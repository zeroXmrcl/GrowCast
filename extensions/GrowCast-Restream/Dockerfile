FROM debian:bookworm-slim

# This network closes large HTTP responses after a few seconds. apt starts
# those debs over, so Chromium never finishes. curl resumes them.
RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    apt-get install -y --print-uris --no-install-recommends \
        chromium \
        ffmpeg \
        fonts-liberation \
        pulseaudio \
        pulseaudio-utils \
        python3 \
        xdotool \
        xvfb \
        > /tmp/uris; \
    mkdir -p /var/cache/apt/archives; \
    while IFS= read -r line; do \
        case "$line" in \
            *"://"*) ;; \
            *) continue ;; \
        esac; \
        url=$(printf '%s\n' "$line" | cut -d"'" -f2); \
        url=$(printf '%s\n' "$url" | sed 's|http://deb.debian.org|https://deb.debian.org|'); \
        file=$(printf '%s\n' "$line" | cut -d' ' -f2); \
        echo "fetch ${file}"; \
        n=0; \
        while [ "$n" -lt 40 ]; do \
            if curl -fL -C - -o "/var/cache/apt/archives/${file}" "${url}"; then \
                break; \
            fi; \
            n=$((n + 1)); \
            echo "resume ${file} ${n}"; \
            sleep 1; \
        done; \
        [ "$n" -lt 40 ]; \
    done < /tmp/uris; \
    apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
        fonts-liberation \
        pulseaudio \
        pulseaudio-utils \
        python3 \
        xdotool \
        xvfb; \
    rm -rf /var/lib/apt/lists/* /tmp/uris; \
    groupadd -g 1001 growcast; \
    useradd -u 1001 -g 1001 -m growcast

WORKDIR /app
COPY restream.py /app/restream.py
RUN chown growcast:growcast /app/restream.py

ENV DISPLAY=:99
USER 1001:1001
CMD ["python3", "-u", "/app/restream.py"]
