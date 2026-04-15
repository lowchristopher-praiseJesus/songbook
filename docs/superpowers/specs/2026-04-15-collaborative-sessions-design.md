# Collaborative Live Sessions — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Context

Worship leaders and musicians need to collaboratively build and adjust a set list in real time — adding, removing, and reordering songs — with all team members seeing each other's changes within a few seconds. Song content (lyrics/chords) can also be edited during a session, with an edit-lock mechanism preventing concurrent text conflicts. Once the set is finalised, the leader exports it to the congregation using the existing one-way share mechanism.

This feature extends the existing Cloudflare Worker + R2 backend with a new Cloudflare KV namespace for session state, and adds a session UI layer to the React SPA.

---

## Roles & Access Model

| Role | How they join | Privileges |
|---|---|---|
| **Leader** | Creates session; gets URL with `?session=CODE&token=LEADER_TOKEN` | Create, close session; all member privileges |
| **Member** | Clicks shared URL `?session=CODE` (no token) | Add / remove / reorder / edit songs |
| **Congregation** | Receives exported `.sbp` snapshot via existing share link | Read-only, no session involvement |

There are no user accounts. Identity is link-based. The leader token is a UUID kept private in the leader's URL; members have no token and no elevated privileges.

A random `clientId` (UUID v4) is generated per browser tab on session join and stored in `sessionStorage`. It is used solely for edit-lock ownership — it is never displayed to users.

---

## Session Lifecycle

1. Leader opens the share modal and chooses **Start Live Session** (can be done with songs pre-selected from the library, or with nothing selected to start an empty session)
2. Leader names the session (optional; defaults to current date) and creates it
3. Worker returns a `leaderToken` and session `code`; UI shows both URLs
4. Leader shares the member URL with the team
5. Members join via the member URL — no confirmation gate, they land directly in the session view
6. All members (including the leader) edit the set list collaboratively
7. Session ends when:
   - Leader closes it explicitly (`POST /session/:code/close`) — session marked `closed: true`
   - Session auto-expires after 30 days (`expiresAt` in KV)
8. After closing, leader exports the final set using the existing "Share via link" mechanism

---

## Data Model

One JSON object per session stored in Cloudflare KV under key `session:{code}`:

```json
{
  "code": "ABC-123",
  "name": "Sunday Service Apr 20",
  "leaderToken": "uuid-v4",
  "createdAt": "2026-04-20T09:00:00Z",
  "expiresAt": "2026-05-20T09:00:00Z",
  "closed": false,
  "version": 7,
  "setList": ["song-id-1", "song-id-2", "song-id-3"],
  "songs": {
    "song-id-1": {
      "meta": { "title": "Oceans", "artist": "Hillsong", "keyIndex": 9, "usesFlats": false },
      "rawText": "..."
    }
  },
  "editLocks": {
    "song-id-1": {
      "clientId": "tab-uuid",
      "lockedAt": "2026-04-20T09:05:00Z",
      "expiresAt": "2026-04-20T09:07:00Z"
    }
  }
}
```

**Key decisions:**
- Song data (meta + rawText) is embedded in the session so members don't need the song in their local library
- `version` is a monotonically incrementing integer; clients track the last seen version to detect changes
- Edit locks carry a 2-minute `expiresAt`; the Worker enforces expiry on every read
- The KV entry's own TTL is set to match `expiresAt` so KV auto-purges expired sessions

---

## Conflict Resolution

### Set list operations (add / remove / reorder)

Operations are applied server-side on each `POST /session/:code/op` request. The Worker reads current state, applies the mutation, increments `version`, and writes back. Mutations are:

| Op type | Mutation | Conflict behaviour |
|---|---|---|
| `add_song` | `songs[id] = song; setList.push(id)` if not already present | Idempotent — adding same song twice is a no-op |
| `remove_song` | `delete songs[id]; setList.filter(...)` | Idempotent — removing absent song is a no-op |
| `move_song` | Splice `songId` to position after `afterSongId` (null = top) | Last write wins — acceptable for small teams |
| `update_song` | `songs[id] = song` — replaces rawText + meta | Only submitted after lock is held; see below |

For the small team sizes this feature targets (2–5 editors), last-write-wins on reorder is acceptable. Concurrent adds from two different members both survive because the op is idempotent.

### Song content editing (edit lock)

1. Member opens song editor → client calls `POST /session/:code/lock/:songId` with `{ clientId }`
2. Worker checks: if no lock, or lock is expired, or lock.clientId matches → grants lock, sets `expiresAt = now + 2min`
3. If another client holds a non-expired lock → returns `423 Locked`
4. While editing, client sends `POST /session/:code/heartbeat/:songId` every 30 seconds → Worker extends `expiresAt` by 2 minutes
5. On save: client submits `update_song` op, then `DELETE /session/:code/lock/:songId`
6. On cancel: client calls `DELETE /session/:code/lock/:songId` only

**Lock expiry recovery (client-side):**

When the editor regains focus (tab switch, screen wake), it re-checks the lock via the next poll response:

- **Lock still held by this client** → continue normally
- **Lock expired, song unchanged** → show warning banner "Your lock expired. No one else edited this song." → offer "Re-lock & Save" and "Discard"
- **Lock expired, song changed by another client** → show diff (their saved version vs. your unsaved edits) → offer "Keep my version" or "Keep their version"

---

## Backend — Worker Endpoints

All new endpoints are added to the existing `songbook-worker/` Cloudflare Worker (Hono).

### `POST /session/create`

Request body:
```json
{
  "name": "Sunday Service Apr 20",
  "songs": [
    { "id": "song-id-1", "meta": { "title": "Oceans", ... }, "rawText": "..." }
  ]
}
```

`name` and `songs` are both optional. If `name` is omitted, it defaults to the current date (formatted on the client). If `songs` is omitted or empty, the session starts with an empty set list.

Response:
```json
{
  "code": "ABC-123",
  "leaderToken": "uuid-v4",
  "memberUrl": "https://app.com?session=ABC-123",
  "leaderUrl": "https://app.com?session=ABC-123&token=uuid-v4",
  "expiresAt": "2026-05-15T09:00:00Z"
}
```

- Generates a 6-character alphanumeric code (uppercase, no ambiguous chars: no 0/O/I/1)
- Generates UUID v4 as `leaderToken`
- Writes initial session object to KV with TTL = 30 days
- Seeds `setList` and `songs` from the request body; starts empty if none provided

### `GET /session/:code/state`

Response:
```json
{
  "version": 7,
  "name": "Sunday Service Apr 20",
  "closed": false,
  "expiresAt": "...",
  "setList": ["id1", "id2"],
  "songs": { "id1": { "meta": {...}, "rawText": "..." } },
  "editLocks": { "id1": { "clientId": "...", "expiresAt": "..." } }
}
```

- Returns full state on every poll (no delta diffing — simplest approach)
- Worker enforces expiry: if `closed` or `expiresAt` passed → returns `410 Gone`
- Expired edit locks are stripped before returning (not written back — lazy cleanup)

### `POST /session/:code/op`

Request body:
```json
{ "type": "add_song", "songId": "id1", "song": { "meta": {...}, "rawText": "..." } }
{ "type": "remove_song", "songId": "id1" }
{ "type": "move_song", "songId": "id1", "afterSongId": "id2" }
{ "type": "update_song", "songId": "id1", "song": { "meta": {...}, "rawText": "..." } }
```

- Worker reads state, applies mutation, increments `version`, writes back
- Returns `{ version }` on success
- Returns `403` if session is closed or expired

### `POST /session/:code/lock/:songId`

Request body: `{ "clientId": "tab-uuid" }`

- Returns `200` with `{ expiresAt }` if lock granted
- Returns `423` with `{ lockedUntil }` if another client holds the lock

### `POST /session/:code/heartbeat/:songId`

Request body: `{ "clientId": "tab-uuid" }`

- Extends lock `expiresAt` by 2 minutes if `clientId` matches current lock holder
- Returns `200` or `404` (lock not found / expired)

### `DELETE /session/:code/lock/:songId`

Request body: `{ "clientId": "tab-uuid" }`

- Removes lock if `clientId` matches; no-op otherwise
- Returns `204`

### `POST /session/:code/close`

Header: `X-Leader-Token: <leaderToken>`

- Sets `closed: true` in KV
- Returns `200`
- Returns `403` if token does not match

---

## Frontend — React SPA Changes

### Polling

A `useSessionSync` hook manages the polling loop:
- Polls `GET /session/:code/state` every 4 seconds while the session view is mounted
- Compares returned `version` to last known version
- On version change: updates local session state (Zustand store or local React state)
- On `410 Gone`: shows "This session has ended" banner, stops polling
- Pauses polling when tab is hidden (`document.visibilityState === 'hidden'`), resumes on focus

### Session detection on app load

`App.jsx` checks `URLSearchParams` for `?session=` on mount (same pattern as existing `?share=`):
- If present → fetches session state → navigates to `SessionView`
- `?token=` param is stored in component state (never persisted to localStorage)

### New / modified files

| File | Change |
|---|---|
| `src/App.jsx` | Detect `?session=` param on mount, route to SessionView |
| `src/lib/sessionApi.js` | New — all Worker session API calls |
| `src/hooks/useSessionSync.js` | New — polling loop, lock heartbeat, version tracking |
| `src/store/sessionStore.js` | New — Zustand store for session state (setList, songs, editLocks) |
| `src/components/Session/SessionView.jsx` | New — main collaborative set list view |
| `src/components/Session/CreateSessionModal.jsx` | New — session name input + created links display |
| `src/components/Session/EditLockWarning.jsx` | New — lock expiry recovery dialog |
| `src/components/Sidebar/Sidebar.jsx` | Add "Start Live Session" option to existing share modal |
| `songbook-worker/src/index.ts` | Add all new session endpoints |
| `songbook-worker/wrangler.toml` | Add KV namespace binding `SESSION_KV` |

### `sessionApi.js` interface

```js
export async function createSession({ name, songs }) { ... }
// Returns { code, leaderToken, memberUrl, leaderUrl, expiresAt }

export async function fetchSessionState(code) { ... }
// Returns { version, name, closed, expiresAt, setList, songs, editLocks }
// Throws { code: 'not_found' | 'expired' | 'closed' | 'network_error' }

export async function submitOp(code, op) { ... }
// Returns { version }

export async function acquireLock(code, songId, clientId) { ... }
// Returns { expiresAt } or throws { code: 'locked', lockedUntil }

export async function heartbeat(code, songId, clientId) { ... }
// Returns { expiresAt } or throws { code: 'not_found' }

export async function releaseLock(code, songId, clientId) { ... }

export async function closeSession(code, leaderToken) { ... }
```

### SessionView layout

```
┌─────────────────────────────────────┐
│ Sunday Service Apr 20    ● Live  [✕]│  ← leader sees [✕] close button
├─────────────────────────────────────┤
│ ⋮⋮  1  Oceans              Key A  ✏ │
│ ⋮⋮  2  El Shaddai          Key Eb ✏ │
│ ⋮⋮  3  How Great Thou Art  Key G  🔒│ ← locked by another member
│     ⚠ Someone is editing this song  │
│ ⋮⋮  4  Amazing Grace       Key G  ✏ │
├─────────────────────────────────────┤
│ + Add Song from Library             │
│ 🔗 Copy member link                 │
│ ↓ Export set (existing share flow)  │
└─────────────────────────────────────┘
```

- Drag handles (⋮⋮) submit `move_song` op on drop
- ✏ opens song editor and acquires lock; button disabled while another member holds lock
- 🔒 shown when `editLocks[songId]` is present and not expired
- "Someone is editing this song" text banner shown below locked songs (no username — link-based, no identity)
- Leader sees a close button (✕) in the header; members do not

---

## Error Handling

| Scenario | Handling |
|---|---|
| Session not found | "This session link is invalid" — full-page message, no library shown |
| Session expired or closed | "This session has ended" — full-page message, offer to go to library |
| Network error on poll | Silent retry on next tick; after 3 consecutive failures show "Connection lost" banner |
| Op submit fails | Toast error "Couldn't apply change — please try again"; local state not updated |
| Lock already held | Edit button shows tooltip "Someone is editing this song" — no modal |
| Lock expired, no conflict | Warning banner in editor — "Re-lock & Save" or "Discard" |
| Lock expired, song changed | Diff dialog — "Keep my version" or "Keep their version" |
| Worker CORS rejection | Non-`APP_ORIGIN` requests receive 403 (existing behaviour) |

---

## Wrangler / Infrastructure Changes

`wrangler.toml` additions:
```toml
[[kv_namespaces]]
binding = "SESSION_KV"
id = "<production-kv-id>"
preview_id = "<preview-kv-id>"
```

No new environment variables needed. Session codes use the existing `APP_ORIGIN` CORS policy.

---

## What Is Not In Scope

- User identity / display names (no accounts, no names shown)
- Notification when a member joins or leaves
- Chat or comments within a session
- Session history / undo log
- Congregation real-time view (congregation uses the existing snapshot share)
- Mobile push notifications

---

## Verification

1. **Create session:** Leader selects songs → "Start Live Session" → names session → Worker returns code + leaderToken → both URLs shown correctly
2. **Join as member:** Open member URL in incognito → session view loads with correct songs and order
3. **Leader privileges:** Only leader URL shows close button; `POST /close` with wrong token returns 403
4. **Concurrent add:** Two members add different songs simultaneously → both appear in set list within one poll cycle
5. **Reorder:** Member drags song → `move_song` op submitted → other member sees new order within 4s
6. **Edit lock:** Member A opens editor → Member B's edit button shows 🔒 → Member A saves → 🔒 clears for Member B
7. **Heartbeat:** Open editor, wait 90s without saving → lock is still held (heartbeat extended it)
8. **Lock expiry (no conflict):** Stop heartbeat (mock), wait 2 min → resume editor → "Re-lock & Save" offered
9. **Lock expiry (conflict):** Stop heartbeat, another member saves changes → diff dialog shown
10. **Session close:** Leader clicks ✕ → `POST /close` → all members see "This session has ended" within 4s
11. **Auto-expiry:** Set `expiresAt` to past in KV → next poll returns 410 → both leader and members see ended message
12. **Export after session:** Leader uses existing share flow to send final set to congregation
