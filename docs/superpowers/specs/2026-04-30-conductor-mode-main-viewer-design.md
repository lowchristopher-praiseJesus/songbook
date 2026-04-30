# Conductor Mode (Main Viewer Variant) — Design Spec

**Date:** 2026-04-30  
**Status:** Approved

---

## Overview

Conductor Mode allows a music director to control which song is displayed on follower devices, all within the normal main song viewer — no Live Session required. The director taps a song and all opted-in followers switch to it within 1 second.

The feature is opt-in twice over: the coordinator must enable it when sharing a collection, and each follower must tap "Follow Director" to activate it. Followers can leave at any time.

This is a separate, lightweight system from the existing Live Session. No song content is uploaded to the server. Each device keeps its own local library; the server tracks only one piece of state — which song the director is currently on.

---

## Architecture Summary

Logically a publish/subscribe pattern:
- **Publisher:** the music director
- **Broker:** new lightweight Cloudflare Worker conductor routes + KV
- **Subscribers:** follower devices
- **Transport:** HTTP polling (pull model, 1-second interval)

Song identity across devices is resolved using `sbpId` — a deterministic integer derived from song name + content, identical on every device that imported the same share package. This replaces per-device UUIDs which differ across imports.

---

## End-to-End Workflow

### Pre-service (coordinator's device)

1. Coordinator curates a collection and opens the Share modal
2. Ticks **"Enable Conductor Broadcast"** — reveals a "Max followers" number input
3. Sets max followers (default: `CONDUCTOR.MAX_FOLLOWERS` from config; input is capped at this value — cannot be exceeded)
4. Clicks **"Create link"** → app:
   - Pre-generates a `conductorCode` (6-char, same charset as session codes) and `directorToken` (UUID)
   - Embeds `conductorCode` in the share package (SBP ZIP)
   - Creates a conductor session on the backend (`POST /conductor/create`)
5. Share modal "done" step shows **two links with two QR codes**:
   - **Member link** + member QR code — for the congregation/band to scan
   - **Director link** (`?share=XYZ&director=<token>`) + director QR code — for the music director only
   - Both QR codes are downloadable as labelled PNGs ("Member" / "Director")
6. Coordinator sends the director link/QR privately to the music director; shares the member link/QR with everyone else

### Import (all devices)

- **Director** opens the director link → imports collection → app detects `?director=<token>` in URL, stores `conductorDirectorToken` alongside the collection in local storage
- **Everyone else** opens the member link → imports collection → collection is silently marked `conductorCode: "ABC123"` in local storage; no directorToken is stored

### During service

1. Director opens any song in the conductor-enabled collection → **"Start Broadcast"** button appears in the main viewer header
2. Director taps "Start Broadcast" → calls `POST /conductor/:code/start` → button changes to "Broadcasting ▶ Stop"
3. Follower devices polling at 1 second detect `live: true` → **"Follow Director"** button fades into the header
4. Follower taps "Follow Director" → joins the broadcast (hard cap enforced) → immediately jumps to director's current song
5. Director taps any song in the collection → all following devices switch within 0–1 second
6. Follower taps "Stop Following" at any time to resume free browsing
7. Director taps "Stop" → broadcast ends → "Follow Director" button disappears on all devices

---

## Configuration File

**New file: `songbook-worker/src/config.ts`**

```ts
export const CONDUCTOR = {
  MAX_FOLLOWERS: 20,        // hard server-side ceiling; coordinator input cannot exceed this
  FOLLOWER_TTL_SECONDS: 90, // follower slot stays active this long without a heartbeat
  SESSION_DAYS: 30,         // conductor session lifetime
}
```

This is the single file to edit for capacity tuning. No Cloudflare dashboard access required. The backend enforces `MAX_FOLLOWERS` regardless of what the client sends — a coordinator cannot bypass it by editing the URL or request body.

---

## Backend Changes (Cloudflare Worker)

### New file: `songbook-worker/src/routes/conductor.ts`

New Hono router mounted at `/conductor`.

#### KV record structure (`conductor:<code>`)

```json
{
  "conductorCode": "ABC123",
  "directorToken": "<uuid>",
  "maxFollowers": 15,
  "live": false,
  "currentSbpId": null,
  "version": 0,
  "followers": {
    "<clientId>": { "lastSeen": "<iso>" }
  },
  "expiresAt": "<iso>"
}
```

Active follower count is computed lazily at join time by counting `followers` entries whose `lastSeen` is within `FOLLOWER_TTL_SECONDS` — same lazy-expiry pattern as existing edit locks. No background cleanup job needed.

#### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/conductor/create` | none | Called at share creation time. Body: `{ conductorCode, directorToken, maxFollowers }`. Creates the KV record. Returns `{ ok: true }`. |
| `GET` | `/conductor/:code/status` | none | Returns `{ live, currentSbpId, version, followerCount }`. The 1-second fast-poll target — single KV read, tiny response. Returns 404 if not found, 410 if expired. |
| `POST` | `/conductor/:code/start` | `X-Director-Token` | Sets `live: true`. Returns `{ ok: true }`. |
| `POST` | `/conductor/:code/current` | `X-Director-Token` | Body: `{ sbpId }`. Sets `currentSbpId`, bumps `version`. Returns `{ currentSbpId, version }`. |
| `POST` | `/conductor/:code/stop` | `X-Director-Token` | Sets `live: false`, clears `currentSbpId`. Returns `{ ok: true }`. |
| `POST` | `/conductor/:code/join` | none | Body: `{ clientId }`. Counts active followers; returns 403 `{ error: "full" }` if at `maxFollowers`. Registers `clientId` with current timestamp. Returns `{ ok: true }`. |
| `POST` | `/conductor/:code/heartbeat` | none | Body: `{ clientId }`. Updates `lastSeen` for `clientId`. Returns `{ ok: true }` or 404 if `clientId` not registered. |
| `DELETE` | `/conductor/:code/join` | none | Body: `{ clientId }`. Removes `clientId` from followers immediately. Returns 204. |

All director endpoints return 403 if `X-Director-Token` header is missing or does not match stored `directorToken`.

### Cost note

At 1-second polling with ~20 follower devices over a 3-hour service ≈ 216,000 KV reads. Exceeds Cloudflare's free tier (100,000 reads/day). Workers Paid plan ($5/month, 10M requests included) is required on active service days.

---

## Parser + Share Package Changes

### `src/lib/parser/sbpParser.js` — one new meta field

In `songFromJson`, add to the returned `meta` object:

```js
sbpId: s.Id,  // deterministic integer: SparkMD5.hash(name + content) % 1_000_000
              // identical on every device that imported the same song
```

This is the stable cross-device song identifier. Because the SBP `Id` is a content hash, the same song always produces the same `sbpId` regardless of which device imported it or when.

### `src/lib/exportSbp.js` — conductor fields in share package

When `conductorCode` is provided to `buildSbpZip`, add to the root JSON object:

```json
{
  "songs": [...],
  "sets": [...],
  "folders": [],
  "conductorCode": "ABC123"
}
```

`directorToken` is **never** embedded in the package — it travels only in the director link URL query param. A follower who inspects the share package cannot obtain director privileges.

### `src/lib/sessionApi.js` → new `src/lib/conductorApi.js`

New file with the following functions:

```js
createConductorSession({ conductorCode, directorToken, maxFollowers })
fetchConductorStatus(code)                          // GET /conductor/:code/status
startBroadcast(code, directorToken)                 // POST /conductor/:code/start
setCurrentSong(code, sbpId, directorToken)          // POST /conductor/:code/current
stopBroadcast(code, directorToken)                  // POST /conductor/:code/stop
joinBroadcast(code, clientId)                       // POST /conductor/:code/join
sendFollowerHeartbeat(code, clientId)               // POST /conductor/:code/heartbeat
leaveBroadcast(code, clientId)                      // DELETE /conductor/:code/join
```

---

## Local Storage Changes

### Collection metadata

Collections in local storage gain two optional fields:

```js
{
  id: "...",
  name: "May 2026 Worship",
  createdAt: "...",
  songIds: [...],
  conductorCode: "ABC123",           // present on all conductor-enabled imports
  conductorDirectorToken: "<uuid>",  // present ONLY on the director's device
}
```

`conductorDirectorToken` is extracted from the `?director=` URL param at import time by `App.jsx` (the same layer that already handles `?share=` and `?session=` params) and written into the collection record alongside `conductorCode`.

### `src/lib/storage.js`

`saveCollections` / `loadCollections` already handle arbitrary collection fields via JSON serialisation — no schema changes needed.

---

## Share Modal UI Changes (`src/components/Share/ShareModal.jsx`)

### Idle step — new "Conductor Broadcast" section

Below the existing "Share lyrics only" toggle:

```
─────────────────────────────────────
Conductor Broadcast

[ ] Enable Conductor Broadcast
    ↳ Max followers  [ 20 ]    (max: 20)     ← only shown when ticked
```

The max followers input:
- Default value: `CONDUCTOR.MAX_FOLLOWERS` (read from a frontend env var `VITE_CONDUCTOR_MAX_FOLLOWERS` set in `.env` / `.env.local`)
- `max` attribute set to `CONDUCTOR.MAX_FOLLOWERS` — browser prevents entry above the ceiling
- Backend also enforces the ceiling independently
- `VITE_CONDUCTOR_MAX_FOLLOWERS` must match `CONDUCTOR.MAX_FOLLOWERS` in `config.ts` — both are edited together when tuning capacity. The backend is authoritative; the frontend value is UI-only.

### Done step — two links and two QR codes when conductor-enabled

```
Member link
[https://app/?share=XYZ                    ] [Copy]
[ Member QR code ]
[Save Member QR]

Director link                        ⚠ Keep private
[https://app/?share=XYZ&director=... ] [Copy]
[ Director QR code ]
[Save Director QR]
```

- Both QR codes rendered via the existing `qrcode` canvas approach
- Director section has a visible warning label ("Keep private — gives broadcast control")
- Both QRs downloadable as separate PNGs labelled "member-qr.png" / "director-qr.png"
- When conductor is not enabled: existing single-link layout is unchanged

---

## Frontend — New Hook: `src/hooks/useConductorSync.js`

Manages the 1-second poll, follower registration, and heartbeat for a conductor-enabled collection.

```
useConductorSync({ conductorCode, directorToken, activeSongSbpId })
  → { live, currentSbpId, followerCount, isFollowing,
      startBroadcast, stopBroadcast, broadcastCurrentSong,
      followDirector, stopFollowing }
```

- Starts the 1-second `fetchConductorStatus` poll when `conductorCode` is present — the poll runs at app level (mounted once in `App.jsx`) for any conductor-enabled collection currently in the library, not just when the user is viewing a song from that collection. This ensures the "Follow Director" button can appear regardless of which song the follower is currently browsing.
- Pauses poll when tab is hidden (same pattern as `useSessionSync`)
- When director: calls `broadcastCurrentSong(sbpId)` whenever `activeSongSbpId` changes and broadcast is live
- When follower: manages join/leave lifecycle and 60-second heartbeat interval
- **`clientId`:** uses the same `sessionStorage` pattern as the existing session system — a UUID generated once per browser session and stored as `conductor_client_id` in `sessionStorage`. Persists across page refreshes within the same tab; a new UUID is generated if the tab is closed and reopened.

---

## Main Viewer — Director UX

When the active song belongs to a conductor-enabled collection where `conductorDirectorToken` is set:

- **"Start Broadcast"** button appears in the main viewer header (greyed if `live: true` already — e.g., director opened app twice)
- **Tap "Start Broadcast"** → calls `startBroadcast()` → button changes to **"Broadcasting · Stop"** with a red indicator dot
- **Navigating to any song in the collection** → `broadcastCurrentSong(sbpId)` fires automatically — no extra tap needed
- **Tap "Stop"** → calls `stopBroadcast()` → button resets; followers return to free browsing
- Director's own view is never locked — they browse freely as normal

Songs outside the conductor-enabled collection do not trigger a broadcast even while live.

---

## Main Viewer — Follower UX

When any conductor-enabled collection (has `conductorCode`, no `conductorDirectorToken`) is present in the local library:

- Background 1-second poll runs silently at app level; no UI shown while `live: false`
- **Broadcast goes live** → **"Follow Director"** button fades into the main viewer header — visible regardless of which song the follower is currently viewing
- **Tap "Follow Director":**
  1. Calls `POST /conductor/:code/join`
  2. If full (403): shows toast "Broadcast is full — try again later" — no state change
  3. On success: immediately resolves `currentSbpId` → finds song in local library by `meta.sbpId` match → navigates to it
  4. If song not found in local library: shows toast "Director switched to a song not in your library" — follower stays on current song and waits for next switch
  5. Header shows **"Following · [Song Title]"** badge
  6. 60-second heartbeat starts to hold the follower slot
  7. As `currentSbpId` changes, viewer navigates automatically within 0–1 second
- **Tap "Stop Following":** calls `DELETE /conductor/:code/join`, stops heartbeat, resumes free browsing from current song
- **Broadcast stops (`live` → `false`):** follower automatically returned to free browsing; "Follow Director" button disappears
- **`isFollowing` state** is React local state — resets on page refresh, requiring explicit opt-in each service

---

## Data Flow

```
Coordinator
  POST /conductor/create  { conductorCode, directorToken, maxFollowers }
  → KV record created

Director taps "Start Broadcast"
  POST /conductor/:code/start  X-Director-Token: <token>
  → KV: live = true

Director taps a song
  → broadcastCurrentSong(sbpId)
  → POST /conductor/:code/current  { sbpId }
  → KV: currentSbpId = sbpId, version++

Followers (1-second poll)
  GET /conductor/:code/status
  → { live: true, currentSbpId: 12345, version: 7, followerCount: 8 }
  → if isFollowing && currentSbpId changed:
      find song where meta.sbpId === 12345
      navigate to it

Follower taps "Follow Director"
  POST /conductor/:code/join  { clientId }
  → count active followers (lastSeen within TTL)
  → if count >= maxFollowers: 403 { error: "full" }
  → else: register clientId, return { ok: true }
  → client navigates to currentSbpId immediately
  → client starts 60s heartbeat loop
```

---

## Out of Scope

- Presence list (director seeing which followers are currently following)
- Scroll position sync (auto-scroll state is not broadcast)
- Multiple simultaneous director broadcasts on the same collection
- Conductor mode for songs created in-app without an `sbpId` (no cross-device stable ID available; name+artist fallback is not implemented to avoid false matches)
- Persistence of `isFollowing` across page refreshes
- Transferring the director role mid-broadcast (director link must be reopened on the new device)
