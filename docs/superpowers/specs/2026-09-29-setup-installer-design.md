# Setup installer

**Date:** 2026-09-29  
**Status:** design approved in conversation

First-run setup is an installer. Later edits stay on the existing admin bands.

## Non-goals

- Replacing Grow, Broadcast, Timelapse, GGS, or Archives with the installer
- A services checklist step
- A green checkmark, or a check instead of the step number
- A typing line on any field except the admin password
- Collecting the camera RTSP address on the Camera step
- Installing MediaMTX
- Persisting admin sessions across a container rebuild

## Rail

The rail is 240px, on the left, for the whole installer.

Steps, in order:

1. Admin
2. Climate
3. Camera
4. Twitch
5. Timelapse

The current step is the light pill: fill `#e4e4e7`, text `#09090b`.

A finished step keeps its number. The circle fill is `#3a3a3a`. The border is `#f3f4f6`. The label is `#f3f4f6`.

A pending step keeps the dim border `#4a4a4a`, no fill, label `#8a8a91`.

A skipped step stays pending (dim). It is not marked finished.

There is no sixth rail item for the done screen. On the done screen, every step that was saved is finished. A skipped step stays dim.

## Stage

The page background is `#1f1f1f`. The form column is at most 440px, vertically centered, with 64px vertical and 48px horizontal padding.

Each step has:

- an uppercase eyebrow, 12px, `#8a8a91`
- a title, 32px, weight 600, `#f3f4f6`
- one line under the title, 14px, `#b4b4b8`
- the form

Labels sit inside the field and lift when the field has text or focus. The lift is 200ms, ease `cubic-bezier(0.16, 1, 0.3, 1)`. Controls stay 40px tall. The primary button is `#e4e4e7` with text `#09090b`.

## Copy

| Step | Eyebrow | Title | Line under the title |
|---|---|---|---|
| Admin | Setup | Create the admin account | The password needs 12 characters. |
| Climate | Climate | Connect Spider Farmer | Email and password only. Google or Apple sign-in will not work. |
| Camera | Camera | Where should visitors watch? | Something like http://stream.example.com/growcam/. Not the rtsp:// address from the camera. |
| Twitch | Twitch | Save the stream key | Creator Dashboard -> Settings -> Stream. |
| Timelapse | Timelapse | Point it at the camera | Use the camera’s rtsp:// address. |
| Done | Ready | The stack is set up | You can change any of this later in admin settings. |

Skip labels: `Skip climate`, `Skip camera`, `Skip Twitch`, `Skip timelapse`. Admin has no skip.

Done list rows, only for steps that ran:

- Admin: the username
- Climate: the chosen controller name, or `Skipped`
- Camera: the saved stream URL, or `Skipped`
- Twitch: `Key saved. Start is on Broadcast.` or `Skipped`
- Timelapse: `Camera address, <interval> min, <timezone>` or `Skipped`

The done button label is `Open the dashboard`. It navigates to `/`.

## Steps

### Admin

Fields: username, password. No repeat-password field.

The password field is the only field with a progress line. The line grows with `scaleX` from the left as `length / 12`, capped at 1. Color is `#e4e4e7` until length is at least 12, then `#3d9a33`. The line is 2px, 180ms, same ease as the label lift.

Continue is disabled until the username is valid and the password is at least 12 characters. Those rules are the existing username pattern and `validatePasswordStrength`.

### Climate

Fields: email, password. No progress line.

Save logs in. Zero controllers: stay on this step and show `Spider Farmer accepted the login and returned no controllers.` One controller: save it and go to Camera. More than one: slide to the list on this same step. The rail stays on Climate.

The list replaces the form. Title becomes `Choose the controller`. The line under it is `Signed in as <email>.` Each row is the device name and `CB`, `PS`, or `LC` plus a shortened serial. One row is selected. `Use this controller` saves that row and goes to Camera. `Skip climate` remains.

### Camera

One field: Stream URL. It must be an `http` or `https` URL accepted by `isSafeHttpUrl`. Anything else, including `rtsp://`, stays on this step with `Paste a browser link, starting with http:// or https://.`

Save writes `streamUrl` on the current grow. That is the same value Broadcast already edits.

### Twitch

Fields: stream key, Twitch channel. The channel may be empty. Save uses the existing restream key and channel save. An invalid typed channel stays on this step with `That channel name is not a Twitch login.` Start is not pressed.

### Timelapse

Fields: Camera RTSP URL, interval in minutes, timezone. The RTSP value must match `rtsp://` with no spaces. Interval is an integer of at least 1. Timezone must be an IANA name. Save writes the existing timelapse settings and `data/timelapse.env`.

## Motion

Step changes, including the climate form becoming the list, use one transition.

The primary button label becomes `Saving`, the button scales to `0.98`, and it is disabled. After 200ms the current column moves 32px left and fades out over 420ms. The next column starts 32px to the right and fades in over 420ms. Easing is `cubic-bezier(0.16, 1, 0.3, 1)`.

Skip uses the same slide and does not show `Saving`.

`prefers-reduced-motion: reduce` removes the transform and the opacity transition. The next step appears immediately. The password line may still show its filled amount without animating.

## Errors

A failed save does not change the step. The message replaces nothing in the rail. It appears under the line beneath the title, in the existing amber warning style (`border-amber-900/70`, `bg-amber-950/30`, `text-amber-200`).

## Later edits

The installer does not reopen from settings.

- The watch link is the existing Stream URL field on Broadcast.
- The RTSP address, interval, and timezone stay on the Timelapse page. The RTSP field stays in the Capture band.
- One saved controller stays the status line on Spider Farmer. Several controllers use the same row list as the installer, inside the Spider Farmer band, not a native select.

## Data

| Step | Write |
|---|---|
| Admin | `data/setup/admin.json`, then a session cookie |
| Climate | `data/ggs.env`, mesh token if missing |
| Camera | `streamUrl` in the current grow record |
| Twitch | existing restream key and channel files |
| Timelapse | timelapse settings record and `data/timelapse.env` |
| Done | `data/setup/complete` |

Skip writes nothing for that step and records the skip for the done list in `data/setup/skipped.json` as a list of step ids: `climate`, `camera`, `twitch`, `timelapse`.

An existing valid `ADMIN_*` trio in the environment still skips the installer.

## Testing

- Rail: current, finished, and pending classes match the colors above. Finished markup contains the step number and does not contain a checkmark.
- Password line is rendered only for the admin password.
- Camera save rejects `rtsp://` and accepts `https://stream.example.com/growcam/`, and the grow record stores that URL.
- Skip climate does not write `SF_SERIAL` and the done list includes `Skipped` for climate.
- Several controllers return the list view without advancing the rail.
- The Twitch line is exactly `Creator Dashboard -> Settings -> Stream.`
