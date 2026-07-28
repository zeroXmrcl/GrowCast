FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

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

# Non-root runtime user (CIS Docker hardening)
RUN addgroup -g 1001 -S growcast \
    && adduser -S -u 1001 -G growcast growcast

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN mkdir -p /app/public/setup /app/public/yourPictures /app/extensions /app/data \
    && chown -R growcast:growcast /app

USER growcast

EXPOSE 3000

CMD ["node", "server.js"]
