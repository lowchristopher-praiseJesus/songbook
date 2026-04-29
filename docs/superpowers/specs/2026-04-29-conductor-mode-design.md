# Conductor Mode — Design Spec

**Date:** 2026-04-29  
**Status:** Approved

---

## Overview

Conductor Mode allows a music director (the session leader) to control which song is displayed on all follower devices in a live session. When a follower opts in, their song view is locked to the leader's current selection and switches automatically — within 1 second — whenever the leader taps a different song.

This feature is opt-in per follower device. Followers can join or leave conductor mode at any time. The leader's experience is unchanged except for an automatic broadcast on every song tap.

---

## Architecture Summary

Logically a publish/subscribe pattern:
- **Publisher:** the worship leader
- **Broker:** Cloudflare Worker + KV
- **Subscribers:** follower devices
- **Transport:** HTTP polling (pull model, not push)

True push (WebSockets / MQTT) was considered and rejected: it requires Cloudflare Durable Objects (paid, significant backend rewrite) and the latency benefit is imperceptible for song switching at human timescales. 1-second polling on a lightweight endpoint is the pragmatic choice.

---

## Backend Changes (Cloudflare Worker)

### 1. `SessionData` type — new field

```ts
currentSongId: string | null   // null = no song broadcast yet
```

Initialised to `null` on `POST /session/create`. Included in the existing `GET /session/:code/state` response so joining devices immediately know the leader's active song.

### 2. New endpoint — `POST /session/:code/conductor`

Leader-only. Requires `X-Leader-Token` header matching the stored `leaderToken`. Sets `currentSongId` and bumps `version`.

**Request body:** `{ songId: string }`  
**Response:** `{ currentSongId: string, version: number }`  
**Errors:** 403 if token missing/wrong; 404 if session not found; 410 if session expired/closed; 400 if `songId` not in session's `songs` map.

### 3. New endpoint — `GET /session/:code/conductor`

Public (no auth). Returns only `{ currentSongId: string | null, version: number }`. Single KV read, tiny response — designed as the fast-poll target.

**Errors:** 404 if session not found; 410 if expired/closed.

### Cost note

At 1-second polling with ~10 devices over a 3-hour service ≈ 108,000 KV reads. This exceeds Cloudflare's free tier (100,000 reads/day). The Workers Paid plan ($5/month, 10M requests included) is required on active service days.

---

## Frontend Changes

### `src/lib/sessionApi.js`

Two new functions:

```js
fetchConductorState(code)          // GET /session/:code/conductor
setCurrentSong(code, songId, leaderToken)  // POST /session/:code/conductor
```

### `src/store/sessionStore.js`

New field: `currentSongId: null`  
New action: `setCurrentSongId(id)` — updates store without bumping version (version comes from server).

### `src/hooks/useSessionSync.js`

A second `setInterval` at **1 second** calls `fetchConductorState` and writes the result to `sessionStore.setCurrentSongId`. This poll runs for all session participants (both leader and followers), obeying the same visibility-change pause/resume logic as the existing 4-second full-state poll.

The 4-second full-state poll is unchanged.

### `src/components/Session/SessionView.jsx` — Leader

- On song tap: call `setCurrentSong()` immediately alongside the existing `setSelectedSongId()`.
- Show a small "▶" indicator next to the currently broadcasting song in the set list.
- No extra confirmation step — selection equals broadcast.

### `src/components/Session/SessionView.jsx` — Follower

**New UI element:** A "Follow Leader" toggle button in the session header. Default: **off**.

**Behaviour when OFF (default):**  
Existing free-browse behaviour. Follower taps any song in the set list. `currentSongId` updates silently in the store but the UI ignores them.

**Behaviour when toggled ON:**  
1. Immediately reads `currentSongId` from the store (already populated by polling) and switches the song viewer to that song. If `currentSongId` is still `null` (leader hasn't tapped a song yet), the follower stays on their current song and waits — the view will switch as soon as the leader selects one.  
2. A persistent banner "Following leader" is shown.  
3. As the leader switches songs, the viewer switches within 0–1 second.  
4. The set list remains visible for context but tapping songs has no effect while following.

**Edge case — removed song:** If the leader removes a song from the session that is the current `currentSongId`, followers in follow mode show an empty viewer state ("Waiting for leader to select a song") until the leader taps another song.

**Toggling back OFF:**  
Follower resumes free-browse from whichever song the leader was on at that moment.

**State:** `isFollowing` is React local state — intentionally resets on page refresh so each session requires an explicit opt-in.

---

## Data Flow

```
Leader taps song
  → setSelectedSongId (local)
  → POST /session/:code/conductor  { songId }
      → Worker validates leaderToken
      → KV: session.currentSongId = songId, version++
      → returns { currentSongId, version }

Followers (1-second poll)
  → GET /session/:code/conductor
      → KV read: returns { currentSongId, version }
  → sessionStore.setCurrentSongId(id)
  → if isFollowing: song viewer switches to currentSongId
```

---

## Out of Scope

- Leader seeing which followers are currently in "follow mode" (no presence tracking)
- Per-follower song position sync (scroll position, auto-scroll)
- The leader being forced off conductor mode by followers
- Any persistence of `isFollowing` across page refreshes
