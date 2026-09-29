# GrowCast-GGS

Read-only [GrowCast](https://github.com/zeroXmrcl/GrowCast) plugin. A sidecar logs into Spider Farmer **cloud MQTT** the same way the official app does, reads `getDevSta` from your GGS control box, and POSTs a normalized snapshot to GrowCast. Visitors then get live climate over `GET /api/data/live-climate` and SSE `/api/data/live-climate/stream`.

This plugin **never** publishes `set*` commands. It does **not** talk Bluetooth. Spider Farmer credentials stay in `.env` on the host and are never sent to browsers.

## Setup

```bash
git clone https://github.com/zeroXmrcl/GrowCast-GGS.git extensions/GrowCast-GGS
cp extensions/GrowCast-GGS/.env.example extensions/GrowCast-GGS/.env
```

Fill `.env`:

- `SF_MQTT_NAME` / `SF_MQTT_PWD` — MQTT CONNECT username and password from the official app (not the Apple/email account password)
- `SF_SERIAL` — cloud serial of the control box. The GrowCast setup wizard discovers this after Spider Farmer login.
- `GROWCAST_MESH_TOKEN` — **same** value as GrowCast `.env.local`
- `SF_LC_SERIALS` — optional comma-separated light-controller serials to try; denied topics are dropped

Do not commit `.env`. Do not turn on a TLS MITM of `sf.mqtt.spider-farmer.com` while this sidecar runs.

## Compose

GrowCast `docker-compose.yml` builds this folder as service `ggs` and sets `GROWCAST_URL=http://growcast:3000`.

The official iPhone app may lose its live MQTT session while the sidecar is connected. GrowCast is the 24/7 reader; the app is best-effort. GrowCast still cannot change lights, fans, or setpoints.

## Reverse proxy

Disable buffering on `/api/data/live-climate/stream` or Server-Sent Events will stall:

```
location /api/data/live-climate/stream {
  proxy_buffering off;
  proxy_http_version 1.1;
}
```

## Tests

```bash
python -m unittest discover -s tests -p "test_*.py"
```
