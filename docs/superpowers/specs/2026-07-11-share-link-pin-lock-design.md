# PIN-Protected Lock on Share Links

**Date:** 2026-07-11
**Status:** Approved for implementation

## Context

[[2026-07-10-share-link-lock-updates-design|Lock Push Updates on Share Links]] shipped a plain boolean lock: anyone holding a share link can flip `locked` on or off via `PATCH /share/:code/lock`, with no verification of who is doing it. That is fine as a "freeze this link" switch, but it means the lock is not actually protecting anything — any holder of the URL can unlock a link someone else just locked.

This spec adds a 4-digit PIN requirement on top of that lock. Locking a share now always means "set a PIN"; unlocking it always means "prove you know that PIN." The PIN check is enforced by the worker itself, not just the UI, since the existing `PATCH /lock` endpoint is reachable directly by anyone who knows the shareCode. After a successful Push Update, the share automatically re-locks using the same PIN, and closing the Share modal on an unlocked, PIN-protected share also re-locks it — a PIN'd share should never sit unlocked outside of an active modal session.

## Approach: Mandatory Server-Verified PIN, No Rate Limiting, Session-Scoped Unlock

**Decisions (from brainstorming):**
- **PIN is verified server-side.** The worker stores a salted hash and rejects unlock attempts with the wrong PIN, independent of what the UI does. This is the only version where "locked" is a real guarantee rather than a UI speed bump.
- **PIN is mandatory, not optional.** There is no more PIN-less lock. Checking "Lock link" always means setting a PIN (the first time) or silently re-engaging an existing one. This replaces, rather than supplements, the plain lock shipped yesterday.
- **No brute-force rate limiting.** A 4-digit PIN is not real security against a scripted attacker; it is a deterrent against casual/accidental unlocking by another link-holder, consistent with the app's no-account trust model. Adding lockout/cooldown machinery is out of scope.
- **Type once, no confirm field.** A single 4-digit entry sets the PIN. A typo just means the "New Link" escape hatch gets used — not catastrophic enough to justify a second field.
- **Unlocking is session-scoped.** Once unlocked via correct PIN, the share stays unlocked only for as long as the modal session that unlocked it is open. A successful Push Update re-locks it automatically; so does closing the modal without pushing. A PIN-protected share should never be left sitting unlocked after the person who unlocked it walks away.
- **Re-locking never needs the PIN.** Only the transition from locked→unlocked needs the PIN. Locked→locked (whether the user manually re-checks the box, a Push Update completes, or the modal closes) reuses the already-stored hash silently.
- **"New Link" always starts unlocked.** A new share can't reuse an old share's hashed PIN, so carrying over "locked" from the old link (as the previous design did) is ambiguous now. New Link resets to unlocked; the user opts back in and sets a fresh PIN if they want the new link locked too.

---

## Server Changes (`songbook-worker`)

### R2 metadata additions (`src/lib/r2.ts`)

```
pinHash: string   (customMetadata, hex SHA-256 digest — present once a PIN has ever been set)
pinSalt: string   (customMetadata, random hex bytes, paired with pinHash)
```

- `putShare(...)` gains optional `pinHash?: string, pinSalt?: string` parameters, written into `customMetadata` when present, left untouched (not cleared) when omitted on a rewrite (locking/re-locking calls must pass through the existing hash/salt to avoid erasing them).
- `headShare(...)` / `getShareIfValid(...)` return type gains `hasPin: boolean`, computed as `customMetadata.pinHash != null`. This is distinct from `locked` — a share can have `hasPin: true, locked: false` (previously PIN'd, currently unlocked).

### PIN hashing helper (`src/lib/pin.ts`, new file)

- `hashPin(pin: string, salt: string): Promise<string>` — `SHA-256(pin + salt)` via `crypto.subtle.digest`, returned as hex.
- `generateSalt(): string` — random bytes via `crypto.getRandomValues`, returned as hex.
- `isValidPinFormat(pin: unknown): pin is string` — `/^\d{4}$/` test.

Deliberately simple hashing (no PBKDF2/bcrypt) — proportionate to a 4-digit PIN with no rate limiting; the goal is "don't store the PIN in plaintext," not "resist offline cracking."

### Updated endpoint: `PATCH /share/:code/lock`

- Body: `{ locked: boolean, pin?: string }`
- **Unlocking** (`locked: false`):
  - 400 `{ error: 'pin_required' }` if `pin` is missing or not 4 digits.
  - Hash the supplied `pin` with the stored `pinSalt` and compare to `pinHash`. Mismatch → 403 `{ error: 'invalid_pin' }`.
  - On match: re-put the object with `locked: false`, `pinHash`/`pinSalt` unchanged.
- **Locking** (`locked: true`):
  - If no `pinHash` exists yet (first-ever lock on this share): `pin` required and validated as 4 digits (400 `pin_required` otherwise). Generate a salt, hash the PIN, store both, set `locked: true`.
  - If a `pinHash` already exists (re-locking a share that's currently unlocked-but-PIN'd): `pin` is ignored if present; no PIN check; just flips `locked` back to `true` reusing the existing hash/salt. This is what allows silent auto re-lock from Push Update and modal-close.
- 404/410 if the share doesn't exist or is expired (unchanged from the existing endpoint).
- Response: `{ locked: boolean }` (unchanged shape).

### Updated endpoint: `PUT /share/:code` (Push Update)

- Existing behavior unchanged: 423 `{ error: 'locked' }` if `existing.locked === true`.
- New: after a successful write, if `existing.hasPin === true`, the write sets `locked: true` (reusing the existing `pinHash`/`pinSalt`) instead of preserving `existing.locked` (which must have been `false` to reach this point). If `existing.hasPin === false` (share has never used the lock feature), behavior is unchanged — `locked` stays `false`.
- Response gains a `locked: boolean` field so the client can tell whether the push also re-locked the share: `{ version, updatedAt, locked }`.

### Updated endpoint: `POST /share/upload` (Create link / New link)

- New optional request header `X-Lock-Pin: 1234`, required and validated as 4 digits when `X-Locked: true` is also sent. 400 `{ error: 'pin_required' }` if locked but the PIN is missing/malformed.
- On a locked creation, generates a salt, hashes the PIN, and stores `pinHash`/`pinSalt` alongside `locked: true` at creation time.

### Updated endpoints: `HEAD /:code`, `GET /:code`

- Add response header `X-Share-Has-Pin: true|false`, alongside the existing `X-Share-Locked`.
- CORS: add `X-Share-Has-Pin` to `Access-Control-Expose-Headers`, and `X-Lock-Pin` to `Access-Control-Allow-Headers`.

---

## Client Changes

### 1. `src/lib/shareApi.js`

```js
uploadShare(blob, expiresInDays = 7, turnstileToken, locked = false, pin = null)
  // sends X-Lock-Pin header when locked && pin

checkShareVersion(shareCode) → { version, locked, hasPin }
  // was { version, locked }; adds hasPin from X-Share-Has-Pin

setShareLocked(shareCode, locked, pin = null) → { locked } | throws
  // new error cases: 403 → code 'invalid_pin', 400 → code 'pin_required'
  // (in addition to existing 'not_found' / 'expired' / 'lock_failed')

updateShare(shareCode, blob) → { version, updatedAt, locked } | throws
  // response now includes locked so the caller can detect an auto re-lock
```

### 2. `src/components/Share/ShareModal.jsx`

New local state (alongside existing `locked`/`lockStatus`):
```js
const [hasPin, setHasPin] = useState(false)
const [pinInputMode, setPinInputMode] = useState('none') // 'none' | 'set' | 'enter'
const [pinValue, setPinValue] = useState('')
const [pinError, setPinError] = useState('')
const [pinAttempts, setPinAttempts] = useState(0)
```

**Live lock check on open** (existing effect, extended): `checkShareVersion` now also sets `hasPin` from the response.

**Toggle behavior** (`handleToggleLocked`, rewritten):
- **Turning on, create mode or never-locked share** (`!hasPin`): don't flip `locked` yet — set `pinInputMode = 'set'`, rendering an inline 4-digit input beneath the switch with a "Lock" / "Cancel" pair. Submitting a valid 4-digit value:
  - Update mode: calls `setShareLocked(shareCode, true, pin)`; on success sets `locked = true`, `hasPin = true`, clears the PIN UI.
  - Create mode: no network call yet — stores `pinValue` in local state; `locked = true` is set immediately; the PIN is sent later via `uploadShare` on "Create link".
  - Cancel: resets `pinInputMode` to `'none'`, leaves the switch off.
- **Turning on, previously-PIN'd share currently unlocked** (`hasPin && !locked`, update mode only): no prompt — calls `setShareLocked(shareCode, true)` directly (no `pin` arg), sets `locked = true` on success.
- **Turning off** (`locked === true`): sets `pinInputMode = 'enter'`, rendering the same inline 4-digit input with "Unlock" / "Cancel". Submitting:
  - Calls `setShareLocked(shareCode, false, pin)`.
  - Success: `locked = false`, clears PIN UI, resets `pinAttempts`.
  - `code === 'invalid_pin'`: increments `pinAttempts`, shows "Incorrect PIN" inline, keeps the input open for retry. At `pinAttempts >= 3`, additionally shows "Forgot your PIN? Use New Link to start over." (UI hint only — no server-side lockout).
  - Any other error: reverts (`locked` stays `true`), shows the existing generic "Couldn't update lock" message, closes the PIN input.
  - Cancel: resets `pinInputMode` to `'none'` and `pinAttempts` to `0`; `locked` is untouched (it was never optimistically flipped, so it's still `true`) — the switch simply stays locked, same as if the toggle had never been touched.

**`handleCreateLink()`**: passes `locked` and (`locked ? pinValue : null`) through to `uploadShare(blob, expiresInDays, shareToken, locked, locked ? pinValue : null)`.

**New Link reset**: when `handleCreateLink` is invoked from the "New Link" button (i.e. `isUpdateMode === true`), force `locked = false` and clear `pinValue`/`pinInputMode` before building the export — New Link never carries over the old link's lock state, regardless of what the toggle currently shows.

**`handlePushUpdate()`**: on success, if `result.locked === true`, set local `locked = true` and show "✓ Link updated and re-locked." in the `update-done` step instead of the plain "Link updated" message. (`locked` will only be `true` here if `hasPin` was already `true`, since Push Update was only reachable while `locked === false`.)

**`handleClose()`**: before resetting state and calling `onClose()`, if `isUpdateMode && hasPin && !locked`, fire a best-effort `setShareLocked(collection.shareCode, true)` (no `pin` argument, not awaited/blocking) — closing the modal on an unlocked, PIN-protected share always re-locks it. Errors from this call are swallowed (logged, not surfaced) since the user is already leaving. Then reset `hasPin`, `pinInputMode`, `pinValue`, `pinError`, `pinAttempts` to their defaults alongside the existing resets.

**Inline PIN input component** (rendered under the "Lock link" switch when `pinInputMode !== 'none'`): a single `<input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4}>`, client-side validated as 4 digits before calling the API (shows "Enter a 4-digit PIN" without a round trip if not), plus "Lock"/"Unlock" and "Cancel" buttons matching the modal's existing `Button` component usage.

---

## Data Flow Summary

```
LOCK A NEVER-LOCKED SHARE:
  toggle "Lock link" on → inline PIN field appears → enter 4 digits → submit
  → PATCH /lock { locked: true, pin } → server stores pinHash/pinSalt → switch confirms

UNLOCK (correct PIN):
  toggle off → inline PIN field appears → enter PIN → submit
  → PATCH /lock { locked: false, pin } → verified against stored hash → unlocked
  → Push Update button now enabled for this modal session

UNLOCK (wrong PIN):
  submit → PATCH /lock { locked: false, pin } → 403 invalid_pin
  → inline "Incorrect PIN" error, field stays open for retry
  → after 3 wrong attempts, hint to use New Link instead

PUSH UPDATE ON A PIN'D, CURRENTLY-UNLOCKED SHARE:
  PUT /share/:code → succeeds → server auto-sets locked: true (reusing stored pinHash)
  → response includes locked: true → client shows "updated and re-locked"

MODAL CLOSED WITHOUT PUSHING, WHILE UNLOCKED:
  handleClose() → hasPin && !locked → silent PATCH /lock { locked: true } (no pin)
  → share is locked again before the modal fully closes

RE-LOCK A SHARE MANUALLY (already has a PIN, currently unlocked):
  toggle on → no prompt → PATCH /lock { locked: true } (no pin) → relocked with existing hash

CREATE NEW LINK, PRE-LOCKED:
  check "Lock link" → set PIN inline → click "Create link"
  → POST /share/upload with X-Locked: true, X-Lock-Pin: 1234 → new share created already locked

NEW LINK FROM AN EXISTING (locked) LINK:
  click "New Link" → locked/pinValue force-reset to false/empty regardless of current toggle
  → new share always starts unlocked
```

---

## Files to Create / Modify

| File | Change |
|---|---|
| `songbook-worker/src/lib/pin.ts` | New: `hashPin`, `generateSalt`, `isValidPinFormat` |
| `songbook-worker/src/lib/r2.ts` | `putShare`/`headShare`/`getShareIfValid` gain `pinHash`/`pinSalt`/`hasPin` |
| `songbook-worker/src/routes/share.ts` | `PATCH /:code/lock` enforces PIN on unlock, stores PIN on first lock, skips PIN on re-lock; `PUT /:code` auto re-locks PIN'd shares and returns `locked` in response; `HEAD`/`GET` add `X-Share-Has-Pin`; `POST /upload` reads `X-Lock-Pin` |
| `songbook-worker/src/index.ts` | CORS: expose `X-Share-Has-Pin`, allow `X-Lock-Pin` request header |
| `src/lib/shareApi.js` | `checkShareVersion` returns `hasPin`; `setShareLocked` takes/validates `pin`, throws `invalid_pin`/`pin_required`; `uploadShare` gains `pin` param; `updateShare` surfaces `locked` from response |
| `src/components/Share/ShareModal.jsx` | Inline PIN entry UI, PIN-aware toggle logic, auto re-lock on push success and on close, New Link reset |

No changes needed to `src/store/libraryStore.js` — same as the base lock feature, PIN/lock state is never cached locally on the collection object, only ever read live from the server.

---

## Verification

1. **Set a PIN on first lock:** Open Share modal on an unlocked link with no prior PIN, toggle "Lock link" on, enter a 4-digit PIN, submit. Confirm `PATCH /lock` fires with the PIN and succeeds. Reopen the modal → toggle shows locked.
2. **Unlock with correct PIN:** Toggle off, enter the same PIN → succeeds, Push Update becomes enabled.
3. **Unlock with wrong PIN:** Toggle off, enter a different PIN → 403, inline "Incorrect PIN" shown, toggle stays locked, field remains open to retry.
4. **Third wrong attempt shows the New Link hint.**
5. **Auto re-lock after push:** Unlock (correct PIN), click Push Update → succeeds, response includes `locked: true`, modal shows "updated and re-locked," reopening the modal shows it locked again.
6. **Auto re-lock on close without pushing:** Unlock (correct PIN), close the modal via Cancel/X without pushing → confirm a `PATCH /lock { locked: true }` fires; reopening shows it locked.
7. **Re-lock never re-prompts for PIN:** With a share that has `hasPin: true` and is currently unlocked, toggle "Lock link" back on manually → no PIN prompt appears, locks immediately.
8. **Create link pre-locked:** In create mode, check "Lock link," enter a PIN, click "Create link" → new link's `HEAD` shows `X-Share-Locked: true` and `X-Share-Has-Pin: true`; unlocking it requires that PIN.
9. **New Link resets lock state:** With the current live link locked, click "New Link" → new link is created unlocked regardless of the old toggle position.
10. **Direct API bypass attempt:** Call `PATCH /share/:code/lock` with `{ locked: false }` and no/wrong `pin` directly (bypassing the UI) → 400/403, confirming server-side enforcement independent of the client.
11. **Expired link:** Locking/unlocking an expired link → 404/410, same as other endpoints.
12. **Run existing share/ShareModal tests** to confirm no regression to the base create/push/plain-lock flow from the prior spec.
