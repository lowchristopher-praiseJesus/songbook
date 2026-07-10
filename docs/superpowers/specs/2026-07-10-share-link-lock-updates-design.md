# Lock Push Updates on Share Links

**Date:** 2026-07-10
**Status:** Approved for implementation

## Context

Any live share link created by [[2026-06-04-live-share-links-design|Live-Updatable Share Links]] can be overwritten by `PUT /share/{shareCode}` — there is no auth check, so anyone who holds the URL (e.g. anyone in a group the link was shared to) can push new content, not just the original sharer. There is currently no way to freeze a link's content: read access (`GET`) and write access (`PUT`) are both gated only by knowledge of the `shareCode`.

The goal is to let anyone with the link **lock** it — once locked, `PUT` (Push Update) is rejected for everyone until it's unlocked again. This must work both for a link that already exists (the "Live link exists" update-mode view of the Share modal) and be settable up front when creating a brand new link.

## Approach: Independent Lock Flag, Decoupled from Push Update

The lock flag is stored as R2 object metadata (`locked: 'true'/'false'`) alongside the existing `expiresAt`/`version`. It is read and written through its own endpoint (`PATCH /share/{code}/lock`), **not** bundled into the `PUT` push-update request.

This decoupling matters: if toggling the lock were part of the same request as Push Update, a locked link could never be unlocked again, because the Push Update button is disabled while locked (see below) — the very button that would carry the "unlock" flag would be unavailable. A separate, always-available endpoint avoids that one-way door.

**Decisions:**
- No authentication required to lock/unlock (consistent with the existing no-account, "anyone with the link" model — same as Push Update itself today)
- Locking blocks `PUT` (content pushes) only — `GET`/`HEAD` (viewing, checking version) are unaffected
- The lock toggle is its own action, independent of Push Update and New Link, and is never disabled by the lock state itself
- The Share modal always re-checks live lock state from the server when opened in update mode, rather than trusting a local cache, since another person may have changed it
- Default is unlocked, for both new and existing links — no behavior change unless a user opts in

---

## Server Changes (`songbook-worker`)

### R2 metadata addition (`src/lib/r2.ts`)

```
locked: 'true' | 'false'   (customMetadata, alongside expiresAt/version)
```

- `putShare(...)` gains a `locked: boolean = false` parameter, written into `customMetadata`.
- `headShare(...)` return type gains `locked: boolean`, parsed from `customMetadata.locked` (missing/unparseable → `false`).

### New endpoint: `PATCH /share/{code}/lock`

- Body: `{ locked: boolean }` (JSON)
- Action: re-`put`s the existing object with the same body/version/expiresAt, only `locked` changes (R2 has no metadata-only update, so this re-writes the object with its existing blob — `bucket.get` then `bucket.put`)
- Always allowed regardless of current lock state (this is the unlock escape hatch)
- 404/410 if the share doesn't exist or is expired (same semantics as other endpoints)
- Response: `{ locked: boolean }`

### Updated endpoint: `PUT /share/{code}` (Push Update)

- After the existing `headShare` existence/expiry check, add: if `existing.locked === true`, return `423` with `{ error: 'locked' }`
- No other change to this handler

### Updated endpoint: `HEAD /share/{code}`

- Add response header `X-Share-Locked: true|false`

### Updated endpoint: `GET /share/{code}`

- Add `X-Share-Locked: true|false` header for convenience (mirrors the existing `X-Share-Version` header there); does not block/change the response body

### Updated endpoint: `POST /share/upload` (Create link / New link)

- New optional request header `X-Locked: true|false` (default `false`), same pattern as the existing `X-Expires-In-Days` header
- Sets the initial `locked` value in `customMetadata` at creation time

---

## Client Changes

### 1. `src/lib/shareApi.js`

```js
// Extend existing helper to also surface lock state
checkShareVersion(shareCode) → { version, locked }   // was { version }; adds locked from X-Share-Locked

// New: toggle lock state on an existing link
setShareLocked(shareCode, locked) → { locked } | throws (404/410 handled like other calls)
```

`uploadShare(blob, expiresInDays, turnstileToken, locked = false)` gains a fourth parameter, sent as the `X-Locked` header.

`updateShare(shareCode, blob)` gains one new error case: a `423` response throws `Object.assign(new Error('locked'), { code: 'locked' })`, matching the existing 404/410 error-throwing pattern.

### 2. `src/components/Share/ShareModal.jsx`

New local state:
```js
const [locked, setLocked] = useState(false)       // checkbox state
const [lockStatus, setLockStatus] = useState('idle') // 'idle' | 'checking' | 'saving' | 'error'
```

**On modal open in update mode** (`isUpdateMode === true`): call `checkShareVersion(collection.shareCode)`, set `locked` from the response, set `lockStatus` from `'checking'` to `'idle'`. While `'checking'`, the lock toggle renders disabled. (This reuses the same round trip already made available by the existing version-check pattern used elsewhere for "Check for updates" — no new polling behavior is introduced here, this is a one-time fetch on open.)

**New "Lock link" toggle**, placed directly below the existing "Share lyrics only" switch, same visual style (rounded switch), with helper text underneath:
> "When locked, no one — including you — can push new content until you unlock it."

Unlike every other field in the modal, this toggle is **never disabled by `isUpdateMode`** — all other fields (name, expiry, lyrics-only, conductor) stay locked to their at-creation values once a live link exists, but this toggle must remain live-editable so an existing link's lock state can be changed without creating a new link.

**Toggle behavior:**
- In update mode: flipping the switch immediately calls `setShareLocked(collection.shareCode, newValue)`. While in flight, `lockStatus = 'saving'` (switch shows a subtle pending state, stays interactive-looking but ignores double-taps). On success, `locked` state is confirmed. On failure, the switch snaps back to its prior value and a small inline error appears: "Couldn't update lock — check your connection."
- In create mode (no existing link yet): flipping the switch only updates local component state; it takes effect when "Create link" is pressed (sent as the `X-Locked` header via `uploadShare`).

**Push Update button:** disabled (grayed out, same visual treatment as other disabled controls in this file) whenever `locked === true`. A short note appears beneath the button row: "Push Update is disabled — this link is locked." **New Link** stays enabled regardless of `locked` — it is the alternate escape hatch, and it also captures whatever the toggle is currently set to as the *new* link's starting lock state.

**`handleCreateLink()`**: pass `locked` through to `uploadShare(blob, expiresInDays, shareToken, locked)`.

**`handlePushUpdate()`**: on catching a `code === 'locked'` error from `updateShare`, set `locked = true` (in case it changed since the modal opened) and show the same "locked" messaging instead of the generic error state.

**`handleClose()`**: reset `locked` to `false` and `lockStatus` to `'idle'`, matching how every other field is reset today.

---

## Data Flow Summary

```
LOCK AN EXISTING LINK:
  open Share modal (update mode) → live lock/version check → toggle "Lock link"
  → PATCH /share/{code}/lock { locked: true } → switch confirms
  → Push Update button now disabled for anyone who (re)opens the modal

UNLOCK:
  open Share modal → toggle shows locked → flip switch off
  → PATCH /share/{code}/lock { locked: false }
  → Push Update re-enabled

ATTEMPT PUSH WHILE LOCKED (stale client / race):
  PUT /share/{code} → server rejects 423 → client shows "locked" error state,
  refreshes local `locked` flag to true

CREATE NEW LINK, PRE-LOCKED:
  check "Lock link" before clicking "Create link" / "New link"
  → POST /share/upload with X-Locked: true
  → new shareCode created already locked
```

---

## Files to Create / Modify

| File | Change |
|---|---|
| `songbook-worker/src/lib/r2.ts` | `putShare`/`headShare` gain `locked` field |
| `songbook-worker/src/routes/share.ts` | New `PATCH /:code/lock`; `PUT /:code` checks lock (423 if locked); `HEAD`/`GET /:code` add `X-Share-Locked` header; `POST /upload` reads `X-Locked` header |
| `src/lib/shareApi.js` | `checkShareVersion` returns `locked`; new `setShareLocked`; `uploadShare` gains `locked` param; `updateShare` throws `code: 'locked'` on 423 |
| `src/components/Share/ShareModal.jsx` | New "Lock link" toggle (always enabled, unlike other update-mode fields); live lock check on open; disable Push Update when locked; pass `locked` through create/push flows |

No changes needed to `src/store/libraryStore.js` collection schema — lock state is not cached locally on the collection object; it is always read live from the server when the modal opens, to avoid showing a stale value to a different holder of the link.

---

## Verification

1. **Lock an existing link:** Open Share modal on a collection with a live link, toggle "Lock link" on. Confirm `PATCH /lock` fires and succeeds. Reopen the modal → toggle still shows locked, Push Update button is disabled with the explanatory note.
2. **Push blocked while locked:** With a link locked, attempt `PUT /share/{code}` directly (e.g. via the existing `updateShare` call path or a manual request) → expect `423`.
3. **Unlock:** Toggle off → `PATCH /lock { locked: false }` → Push Update button re-enabled on reopen.
4. **Create link pre-locked:** In create mode (no existing link), check "Lock link", click "Create link" → new link's `HEAD` response shows `X-Share-Locked: true`; a subsequent Push Update attempt against that new link is rejected.
5. **New Link while existing link locked:** With the current live link locked, click "New Link" → succeeds regardless (unaffected by the old link's lock), and carries over whatever the toggle is currently set to.
6. **Stale client race:** Simulate two "holders" of the same link — one locks it, the other (with the modal already open before the lock happened) attempts Push Update → gets the 423 error state rather than a silent failure.
7. **Expired link:** Toggling lock on an expired link → `404`/`410`, same as other endpoints.
8. **Run existing share/ShareModal tests** to confirm no regression to the base create/push/import flow.
