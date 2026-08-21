FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --include=optional installs sharp's musl prebuilds on Alpine.
RUN npm ci --include=optional

FROM base AS builder
WORKDIR /app
ENV BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apk add --no-cache su-exec \
    && addgroup -g 1001 -S growcast \
    && adduser -S -u 1001 -G growcast growcast

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/public/setup /app/public/yourPictures /app/extensions /app/data \
    && chown -R growcast:growcast /app

# Entrypoint starts as root so bind mounts can be chowned, then su-exec to growcast.
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "server.js"]
