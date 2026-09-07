# Broadcast dashboard and optional Twitch toast

**Date:** 2026-08-26  
**Branch:** `feat/obs-overlay`  
**Status:** architecture approved; spec written (not committed)

`/admin/stream` is still a Settings page with a preview on top. Restyle it as a Broadcast booth (master control + compact rack). Public `/` may show a filled Twitch-purple toast, opt-in default off, only while the sidecar is actually live. Channel login is resolved from the stream key via Helix and is editable.

---

## Non-goals

- ON AIR tally on the program monitor
- Live pill, banner, or dot in the admin sidebar
- Toast on `/overlay`, `/overlay/capture`, `/admin`, Energy, Gallery, Past Grows
- Visitor-dismiss toast
- Twitch chat, VODs, clips
- Helix inside the restream sidecar
- Putting the stream key, capture token, or Helix secret in public grow JSON
- Query-param overlay layout/stream
- New stream backends (WHIP, MediaMTX in Compose)
- Worldwide SaaS

---

## Product

| Decision | Choice |
|---|---|
| v1 | Booth restyle + optional homepage toast |
| Layout | Master control: program monitor left, compact rack always visible on the right |
| Sidebar label | Broadcast (href stays `/admin/stream`) |
| Monitor | Camera + HUD, `grow.streamUrl`, no ON AIR |
| Rack | Twitch, OBS, Camera |
| Dashboard toast | Filled `#9146FF`, bottom-right, `/` only |
| Toast opt-in | Switch on Twitch rack, **default off** |
| Channel | Helix from `live_{userId}_` prefix; field shown and editable |

---

## Broadcast page

Keep `AdminChrome`. `SETTINGS_SECTION_LINKS` label **Stream** → **Broadcast**. Route remains `/admin/stream`. `/admin/broadcast` redirects to `/admin/stream`. Existing hash `#twitch` / `#overlay` / `#stream` still map here.

**Monitor:** `OverlayHud` with `overlayStream="include"`, `lockStream`, `streamUrl={grow.streamUrl}`, layout/scale from the grow. Empty URL: “Save a Stream URL”. Not `/overlay/capture`. Not public `/overlay` (Transparent would hide the tent). No ON AIR / OFF badge on the picture.

**Twitch rack:** sidecar OFF/LIVE (existing `displayRestreamStatus` / stale → off). Start / Stop. **Dashboard toast** switch, default off. Copy is a switch, not a card subtitle.

**OBS rack:** Copy overlay URL (clipboard; fallback select). Overlay stream radios (transparent / include). Overlay layout radios (left rail / bottom bar). HUD scale slider.

**Camera rack:** Stream URL, show grow name, stream key (password field, blank save keeps current), **Twitch channel** (Helix-filled, editable).

Stream/overlay/showGrowName save as today (grow JSON). Key / start / stop as today. Channel + toast switch write `data/restream/channel.json` only.

---

## Channel lookup and storage

Env (GrowCast `.env.local`, not the sidecar):

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

On **save stream key**, parse `live_{userId}_` (digits). If parsed and env is set, Helix app-access token then `GET https://api.twitch.tv/helix/users?id={userId}`. Use `login`. Write it into `channel.json` unless the operator already typed a non-empty login this submit (typed wins).

`data/restream/channel.json`:

```json
{ "login": "0xmarcel", "toastEnabled": false }
```

Mode 600, same dir as `twitch.key`. Missing file → `{ login: "", toastEnabled: false }`. Never grow JSON.

Helix missing/fail / key not `live_{id}_`: do not clear a saved login; Start still works; toast cannot go live without a login.

Public `GET /api/data/broadcast`:

- `{ "live": true, "login": "0xmarcel" }` iff sidecar display state is `live` **and** `toastEnabled` **and** `login` is a non-empty Twitch login (letters, digits, underscore)
- else `{ "live": false }` with **no** `login` key

No stream key, no token, no Helix secret.

---

## Public toast

Mounted only on the grow homepage `/` (not site layout global). Client polls `/api/data/broadcast`. When `live` is true, render a filled `#9146FF` card, bottom-right, over the page (above footer). White Twitch-style glitch + **Live on Twitch** + `twitch.tv/{login}`. Entire card is `<a href="https://twitch.tv/{login}">` with `target="_blank"` `rel="noopener noreferrer"`.

Stop, switch off, empty login, or stale sidecar → unmount. No visitor X. No red. `prefers-reduced-motion`: no entrance animation required (static is fine).

---

## Errors

- Helix 4xx/5xx / missing env: log without secrets; keep last login
- Clipboard deny: select the OBS URL field
- Public API always 200 JSON; never 500 on missing restream files
- Stale sidecar heartbeat: not live (existing `RESTREAM_STATUS_STALE_MS`)

---

## Tests

- Chrome nav label Broadcast, href `/admin/stream`
- Monitor OverlayHud include+lockStream, no ON AIR string
- `channel.json` default `toastEnabled: false`; not in grow JSON
- Parse `live_123_abc` → user id `123`; Helix mock fills login; typed login wins
- Public broadcast API: no login unless live+enabled+login; never includes key/token
- Homepage includes toast markup only when payload is live
- Overlay/capture and compose restream token interpolation unchanged

---

## Implementation notes

- Reuse `AdminPanel` / admin controls in the rack. Booth layout is CSS grid, not a new theme.
- Helix client in `lib/restream/twitch-helix.ts` (or similar). No SDK.
- Toast is a small client component; poll ~5s.
- Hash redirects: keep mapping to `/admin/stream`.
