# Conductor Broadcast — UX Redesign (Tier 2)

**Date:** 2026-05-03
**Status:** Draft
**Supersedes pieces of:** `2026-04-29-conductor-mode-design.md`, `2026-04-30-conductor-mode-main-viewer-design.md`

---

## Overview

The Conductor Broadcast feature works mechanically but fails several user-experience tests across its three personas (Coordinator, Director, Follower). The single largest pain is that the Director URL is shown once in a modal and then lost forever — there is no way to retrieve it without recreating the entire session. Other pains include heavy import friction for casual followers, near-invisible "waiting for broadcast" status, ambiguous session lifecycle (Stop vs End), and a refresh bug where the Director sees "Start Broadcast" while a session is already live.

This spec redesigns the user-facing surface area without rewriting the underlying transport. The poll-based broker (Cloudflare Worker + KV), `conductorCode`, and `directorToken` semantics stay the same. Changes target: link discoverability, role detection on link open, follower onboarding, broadcast lifecycle clarity, and terminology consistency.

---

## Goals

1. **Coordinators never lose a link.** Both the Member and Director URLs for any broadcast they created are reachable from inside the app at any time, until the session expires.
2. **A coordinator who is also the director never has to copy a link to themselves.** Self-direct is a one-click operation from the share modal.
3. **Followers land on content, not on a confirmation modal.** Opening a member link mid-broadcast should put them on the right song with at most one click.
4. **The "is this thing on?" question is always answered prominently.** Pre-broadcast waiting state, scheduled time, and live state are visually unmistakable.
5. **Sessions have a clear end.** "Stop broadcasting" (resumable) and "End session" (terminal) are distinct verbs with distinct consequences for everyone.
6. **One vocabulary.** "Conductor" is the user-facing word; the codebase uses it consistently.

Out of scope:
- Push notifications (deferred to Tier 3).
- Director presence roster / per-follower drill-down (deferred to Tier 3).
- WebSocket transport.
- Multi-director sessions.

---

## Architecture summary

The redesign is mostly client-side. New frontend pieces:

- **`BroadcastsPanel`** — a new Sidebar section listing all conductor-enabled collections in the user's library, with role-aware actions.
- **`useBroadcastRegistry`** — derived selector + helpers over the existing `collections` store. Persistence requires several new optional fields on the collection record (see Persistence section).
- **`ConductorJoinModal`** — replaces ImportConfirmModal *only* when the incoming share has a `conductorCode`. Branches on whether `?conductor_token=…` (or its alias `?director=…`) is present.
- **`BroadcastWaitingBanner`** — full-width banner shown to followers while phase is `dormant`/`waiting`/`ended`, replacing the small gray header text.
- **Refactored `ConductorBar`** — consumes a single `phase` derived from server state plus role; no local `isBroadcasting` boolean.

New backend pieces:

- **`POST /conductor/:code/end`** — terminal endpoint. Sets a `terminated:true` flag on the KV record so subsequent polls return 410. The KV entry itself is left to expire naturally via existing TTL. Distinct from `/stop`, which only flips `live:false` and keeps the session resumable.
- **`POST /conductor/:code/preview`** — director-only. Sets `currentSbpId` *without* setting `live:true`. Lets followers see the upcoming first song before broadcast starts.

Existing endpoints keep current semantics. The `?director=` URL parameter is renamed to `?conductor_token=` going forward; the old name is accepted as an alias for one release cycle.

---

## Persistence schema changes

### `collections[]` record (localStorage)

Adds five optional fields:

```jsonc
{
  // existing
  "id": "...",
  "name": "Easter Set",
  "songIds": [...],
  "conductorCode": "ABC123",            // existing
  "conductorDirectorToken": "uuid",     // existing, conductor only (renamed in code to conductorToken — see §7)
  "conductorBroadcastTime": "ISO",      // existing, optional

  // NEW
  "conductorRole": "coordinator" | "conductor" | "follower",  // disambiguates UI affordances
  "conductorShareCode": "abc123",                            // for re-deriving links
  "conductorCreatedAt": "ISO",                               // for sort + expiry display
  "conductorExpiresAt": "ISO",                               // mirror of server TTL
  "conductorEnded": true                                     // set when /end is called or terminated 410 received
}
```

The Member URL and Conductor URL are *derived* on the fly in the BroadcastsPanel from `conductorShareCode + conductorBroadcastTime + conductorDirectorToken` rather than stored separately, to keep the schema minimal and to ensure URLs always point at the live host even if the deploy URL changes.

`conductorRole` values:
- `coordinator` — created the share locally but did NOT keep the conductor token (delegated case). Has the share code locally; URLs are reconstructible from local state.
- `conductor` — has the conductor token, regardless of whether they originally created the share. Has broadcast control. (Self-directing coordinators land here, not in `coordinator`, because they hold the token.)
- `follower` — imported a member link. No token, no share-code re-issue ability.

A single user can have all three roles across different collections.

### Server `ConductorData`

Adds a `terminated: boolean` flag (default false). `/end` sets it to true; subsequent reads return 410 Gone. We do not delete the KV record immediately because in-flight followers still need a 410 response to reach the `ended` phase cleanly.

---

## Component design

### 1. ShareModal — coordinator-side changes (Item D + I)

The "Enable Conductor Broadcast" toggle keeps its current label. When ticked, one new affordance appears (the "I'll be conducting this myself" checkbox); existing fields stay:

```
[x] Enable Conductor Broadcast
    [x] I'll be conducting this myself
    Max followers: [number input — unchanged in this tier]
    Scheduled time: [datetime input — unchanged]
```

(Preset buttons for max followers are out of scope for Tier 2; they're a Tier 3 polish item.)

When **"I'll be conducting this myself"** is ticked (default ON):
- After Create, the local browser is auto-promoted to director: the just-created collection (which the coordinator already has, since they exported it) gets `conductorRole: "director"` plus the directorToken merged in. *No re-import.*
- The Done step shows only the **Member URL** + QR + copy button. The director URL is still available under "Show director link (advanced)" for the rare case the coordinator wants to delegate.
- A success line reads: "You're set up as the Conductor. Use the Broadcasts panel to start when ready."

When unticked:
- Done step shows both URLs side by side as today, but the layout is reorganized into two tabs: **"For your group"** (member) and **"For the conductor"** (director, with the orange private warning).
- Both URLs persist in the new Broadcasts panel under the *coordinator* role (see §3) so they can be re-copied later.

The modal still closes after the user clicks Done; the panel covers re-access.

### 2. ConductorJoinModal — replaces ImportConfirmModal for conductor-coded shares (Item B + C)

When `App.jsx` parses a share URL and the share file contains `conductorCode`, it routes to a new modal instead of `ImportConfirmModal`.

**If `?conductor_token=…` is in the URL** (director link):

```
🎙 Conductor link

You've been given control of this broadcast:
  Easter Set — 12 songs
  Scheduled: Sun 2026-05-10 9:00 AM (or "no scheduled time")

[ Cancel ]  [ Import & become Conductor ]
```

The primary button imports + sets `conductorRole: "director"`.

**If only `conductorCode` is present** (member link):

```
🎵 Join broadcast

Easter Set — 12 songs
Status: Live now · Following 4
        (or "Starts in 23 minutes" / "Waiting to start")

[ Just import the songs ]   [ Import & follow live ]
```

The status line is fetched on modal open via a single `fetchConductorStatus(code)` call. If the broadcast is already live, "Import & follow live" is the primary button and on click:
1. Imports the collection (or merges into an existing one — see dedupe below).
2. Calls `joinBroadcast`.
3. Sets `currentSong` from the server's `currentSbpId`.
4. Closes the modal directly to the live song view.

If `live:false` and a scheduled time exists, the primary button reads "Import & wait for broadcast" and the page lands on the BroadcastWaitingBanner state.

**Dedupe rule (Item C):** before importing, check whether the user already has a collection with the same `conductorCode`. If yes, skip the import path entirely — just attach `conductorBroadcastTime` if newly present and route directly to follow/wait state. This solves the "follower closes tab and reopens link" case.

### 3. BroadcastsPanel — new Sidebar section (Item A)

A collapsible Sidebar section, sitting above or below "Collections", that renders only when at least one `conductorRole`-bearing collection exists. Conditional visibility prevents the section from appearing for users who never use the feature.

Each row reflects role:

**Coordinator (no self-direct):**
```
🎵 Easter Set                       ⓘ Idle · expires in 6 days
  [Copy member link] [Copy conductor link] [Show QR codes]
  [End session ⌫]
```

**Coordinator + Conductor (self-direct):**
```
🎙 Easter Set                       🟢 Live · 4 following
  [Copy member link] [Show member QR]
  [Stop broadcasting] [End session ⌫]
```

**Conductor only (delegated):**
```
🎙 Easter Set                       ⏳ Waiting · starts Sun 9:00 AM
  [Copy member link] [Show member QR]
  [▶ Start broadcast]    [End session ⌫]
```

**Follower:**
```
👥 Easter Set                       🟢 Live now · not following
  [Open & follow] [Forget broadcast]
                                    or
👥 Easter Set                       ⚪ Ended
  [Forget broadcast]                ← tidies up old collections
```

The status text comes from a hook, `useBroadcastStatuses`, that polls `fetchConductorStatus` for each unique `conductorCode` in the registry. Polling cadence is the same backoff used by `useConductorSync` (capped, dormant before scheduled time). Multiple collections sharing one code (rare) collapse to one poller.

The "End session" action requires confirmation: *"End the session for everyone? Followers will see 'Session ended' and won't reconnect. This can't be undone."* On confirm, calls `POST /conductor/:code/end`. Locally, the collection is marked with `conductorEnded: true` and stops polling immediately.

The "Forget broadcast" action removes the conductor fields from the collection — the collection itself stays, but is no longer tracked as a broadcast. Confirmation: *"This collection will become a regular collection. The songs are kept."*

### 4. ConductorBar — refactored (Item F)

Today's `isBroadcasting` local state is removed. Live status is derived strictly from server `live` plus role:

```js
const status =
  isConductor
    ? (serverLive ? 'broadcasting' : 'idle-conductor')
    : derivePhase(serverLive, broadcastTime, hasEverBeenLive)
```

After refresh, the hook fetches status once and the bar renders correctly without a stale boolean.

The ConductorBar continues to live in the header but is now a *summary* of the active broadcast, with deeper controls offloaded to BroadcastsPanel. Header bar shows: status pill (idle / waiting / live / following / ended) and a single primary action (Start / Stop / Follow / Unfollow). It does NOT show "End session" — that's an intentional one-step-removed action available only from the panel.

When the user has multiple conductor collections (rare but possible), the active one for the bar is the *currently open* collection if any; otherwise the most recently active one (by server status). This replaces the current `find(c => c.conductorCode)` first-match logic.

### 5. BroadcastWaitingBanner — follower pre-broadcast prominence (Item G)

For followers in `dormant`/`waiting` phase, replace the tiny gray header text with a full-width banner above the song view:

```
┌──────────────────────────────────────────────────────────────┐
│ ⏳ Waiting for broadcast                                     │
│    Easter Set · starts Sun 2026-05-10 at 9:00 AM             │
│    Countdown: 00:23:14                                       │
│                                                              │
│    Preview: "Hosanna" (the conductor will start here)        │
│    [Read the songs while you wait]                           │
└──────────────────────────────────────────────────────────────┘
```

The "Preview" line appears only if the director has called `POST /conductor/:code/preview` to set a pre-broadcast `currentSbpId`. Otherwise the line is omitted.

Once `live:true`, the banner is replaced by an unobtrusive "Following 🟢" pill in the header (existing behavior).

For `ended` phase, the banner reads:
```
✓ Broadcast ended — keep these songs in your library?
[Keep] [Forget broadcast]
```

### 6. Backend: `/end` and `/preview` endpoints

```ts
// POST /conductor/:code/end
// Conductor-only. Marks session terminated; subsequent polls 410.
conductor.post('/:code/end', requireConductor, async (c) => {
  const data = await getConductor(...);
  await putConductor(..., { ...data, terminated: true, live: false, currentSbpId: null });
  return c.json({ ok: true });
});

// POST /conductor/:code/preview { sbpId: number }
// Conductor-only. Sets currentSbpId without setting live=true.
conductor.post('/:code/preview', requireConductor, async (c) => {
  const { sbpId } = await c.req.json();
  await putConductor(..., { ...data, currentSbpId: sbpId, version: data.version + 1 });
  return c.json({ ok: true, currentSbpId: sbpId });
});
```

(`requireConductor` is the renamed `requireDirector` middleware — see §7.)

`fetchConductorStatus` continues to return `currentSbpId` regardless of `live`, so the existing follower hook + new banner can both read it. `getConductor` returns 410 when `terminated:true`, identical to the natural-expiry path; followers reach `ended` with no client change.

### 7. Terminology cleanup (Item I)

Single pass renaming:

| Old | New |
|-----|-----|
| `?director=…` | `?conductor_token=…` (alias `?director=` accepted for 1 release) |
| `directorToken` (variable, prop) | `conductorToken` |
| `conductorDirectorToken` (collection field) | `conductorTokenSecret` (alias on read for 1 release) |
| `Director link` (UI) | `Conductor link` |
| `isDirector` | `isConductor` |
| `ConductorBar` | unchanged (already correct) |
| "Director" in any visible string | "Conductor" |

Backend variable `directorToken` in worker code is renamed too; the `X-Director-Token` header is replaced by `X-Conductor-Token` with the old header accepted as fallback for 1 release.

Test fixtures update accordingly. No URL breakage for users with existing share links because of the alias.

---

## Data flow walkthroughs

### Scenario 1: Self-conducting coordinator (the common case)

1. User opens Sidebar → Export → Share via link.
2. Toggles "Enable Conductor Broadcast", optionally sets max followers and scheduled time.
3. Leaves "I'll be conducting this myself" checked.
4. Clicks Create.
5. Modal Done step shows Member URL + QR. Conductor URL hidden behind disclosure.
6. Locally: collection now has `conductorRole: "conductor"` and `conductorToken`.
7. Sidebar's BroadcastsPanel shows the new entry as "🎙 Easter Set · Idle".
8. User shares the Member URL via WhatsApp.
9. When ready, user clicks "▶ Start broadcast" in the panel (or the header bar). Server `live=true`.
10. As they navigate songs, followers sync.
11. Done — clicks "End session" in the panel. Confirms. Followers see "Session ended" banner. KV entry sets `terminated:true`. Local collection sets `conductorEnded: true` (the entry stays in the BroadcastsPanel as "Ended" until the user clicks "Forget broadcast", which strips all conductor fields and the entry leaves the panel).

### Scenario 2: Coordinator delegates to a separate Conductor

1. Coordinator runs Create with "I'll be conducting" *unticked*.
2. Done step shows two tabs: For your group / For the conductor.
3. Coordinator copies and sends the conductor URL via private channel; the member URL via group channel.
4. Coordinator's panel shows "🎵 Easter Set · Idle · expires in 7 days" with both copy buttons available *forever* (until expiry). The coordinator's local collection has `conductorRole: "coordinator"` (no token kept locally).
5. Delegated conductor opens conductor URL → ConductorJoinModal recognizes `?conductor_token=`, shows "🎙 Conductor link" import flow.
6. Conductor's local state: collection imported with `conductorRole: "conductor"`.
7. Lifecycle proceeds as in Scenario 1.

### Scenario 3: Follower opens member link before broadcast starts

1. Follower clicks WhatsApp link.
2. App parses share + conductorCode + scheduled time.
3. ConductorJoinModal opens, shows "🎵 Join broadcast — Starts in 23 minutes".
4. Follower clicks "Import & wait for broadcast".
5. Collection imported with `conductorRole: "follower"`, `conductorBroadcastTime` set.
6. App routes to a song view and shows BroadcastWaitingBanner with countdown.
7. (If conductor has previewed a song) Banner shows "Preview: Hosanna" and the song view shows that song.
8. When broadcast goes live, banner disappears, header pill shows "🟢 Following", song auto-syncs.

### Scenario 4: Follower reopens link mid-broadcast

1. Follower had closed the tab, now reopens member URL.
2. App parses share. Dedupe check finds existing collection with same `conductorCode`.
3. ConductorJoinModal sees the dedupe hit and skips the import path: it shows "Already in your library — rejoin broadcast?" with primary "Rejoin & follow".
4. On click: `joinBroadcast`, `selectSong(currentSbpId)`, modal closes.

### Scenario 5: Refresh during live broadcast (the bug fix)

1. Conductor mid-broadcast, refreshes browser.
2. App boots, finds collection with `conductorRole: "conductor"`, hooks `useConductorSync`.
3. First poll returns `live:true`.
4. Derived status: `broadcasting`. Bar shows "🔴 Broadcasting · 4 following · Stop".
5. No spurious "Start broadcast" button.

---

## Error handling

- `/end` called on a non-existent or already-terminated session: returns 200 idempotently; client clears local fields regardless.
- `/preview` called when broadcast is already live: returns 200 and just updates `currentSbpId` (effectively the same as `/current`).
- ConductorJoinModal status fetch fails (network): falls back to ImportConfirmModal-style behavior with a toast "Couldn't check broadcast status — you can join later from the Broadcasts panel."
- Dedupe check finds multiple collections with the same `conductorCode` (shouldn't happen but defensive): picks the most recent and merges any new metadata.
- BroadcastWaitingBanner's countdown reaches zero with no live signal: stays at "Waiting…" with no countdown. Polling continues at the LIVE cadence for a grace period (5 min) then drops back to backoff.

---

## Testing

New unit tests:
- `useBroadcastRegistry` derives roles correctly from collection records.
- ConductorBar status derivation: every (role × server-state × phase) combination produces the expected pill.
- Dedupe logic in `App.jsx` share-import path.
- Worker: `/end` sets terminated, subsequent reads 410.
- Worker: `/preview` updates `currentSbpId` without flipping `live`.

New integration tests (Vitest + Testing Library):
- ShareModal "I'll be conducting this myself" path: collection ends up with `conductorRole: "conductor"` and no second copy is created.
- ConductorJoinModal conductor-link path: imports + sets role + lands on first song.
- ConductorJoinModal member-link live-now path: imports + follows + selects current song in one click.
- BroadcastWaitingBanner renders countdown and disappears on live.
- Refresh during broadcast scenario: mounts hook with stored directorToken, polls server live=true, ConductorBar shows broadcasting state.

Manual QA matrix:
- Coordinator-self-direct on desktop and mobile.
- Coordinator-delegate (two browsers).
- Follower opens link before / during / after broadcast.
- Follower reopens after closing.
- Conductor ends session (followers must see clear ended state).
- Old `?director=` URLs continue to work for one release.

---

## Migration

`collections[]` records gain five optional fields. Existing records without them keep working: when a record has `conductorCode` but no `conductorRole`, the registry derives a role from local state on first read — `conductorDirectorToken` present → `"conductor"` (legacy data can't distinguish a self-directing coordinator from a delegated conductor; both held the token locally, and they share the same UI affordances, so collapsing them to `"conductor"` is the safe migration). conductorCode-only → `"follower"`. Neither → not a broadcast. The derived role is then persisted back into the record. After one release we can stop deriving and require the field.

`conductorCreatedAt` / `conductorExpiresAt` for migrated records are filled in lazily from the next successful `fetchConductorStatus` response (the worker already knows the session's `expiresAt`; we'd need to expose it in the status response if it isn't already).

The `?director=` → `?conductor_token=` rename is alias-compatible. We deprecate the old name in release notes; remove the alias in the release after. `X-Director-Token` header alias on the worker mirrors this.

---

## Risks and trade-offs

1. **`BroadcastsPanel` adds a new permanent UI surface** that won't appear for users who never use the feature, but for users who use it once will linger forever (until they "Forget broadcast"). This is correct — orphaned broadcast collections are clutter and the "Forget" action is the right cleanup verb. Cost: a few hundred lines of UI.

2. **Self-direct shortcut couples coordinator + conductor identity to the browser.** If a coordinator who self-directed switches devices mid-event, they lose control. Mitigation: the conductor URL is still copyable from the BroadcastsPanel ("Copy conductor link"), so they can email it to themselves and re-import on the new device. We don't promise device portability for self-directors in v1.

3. **Dedupe-by-`conductorCode` assumes the same broadcast won't be reissued under the same code.** True today (codes are random per session). If we ever add "renew session", dedupe would need to compare timestamps too.

4. **`/end` deletes from the followers' POV but the collection lingers locally.** Intentional — followers may want to keep the songs. The "Forget broadcast" affordance gives them a clean exit. Risk: someone forgets to forget, and their library accumulates dead broadcast collections. Acceptable, and addressable later with a "Clean up expired broadcasts" sweep.

5. **One-release alias windows for `?director=` and `X-Director-Token`** mean we can't do the rename atomically. Acceptable; standard practice.

6. **Polling overhead in BroadcastsPanel** scales with number of unique broadcasts in registry. Capping at, say, 5 active polls and showing "(refreshing slowly)" on the rest keeps overhead bounded. Tier 3 could move to a single bulk-status endpoint.

---

## Implementation order (suggested)

1. Persistence schema additions (`conductorRole` etc.) and migration shim — no UI yet.
2. `useBroadcastRegistry` hook + `useBroadcastStatuses` poller.
3. `BroadcastsPanel` UI (read-only first: just listing entries).
4. ConductorBar refactor (drop `isBroadcasting`, derive from server).
5. ShareModal "I'll be conducting" path (self-direct).
6. ConductorJoinModal replacing ImportConfirmModal for conductor-coded shares.
7. Dedupe logic in App.jsx import path.
8. Backend `/end` and `/preview` endpoints + worker tests.
9. BroadcastWaitingBanner.
10. Terminology rename pass + alias headers/params.
11. End-session lifecycle wiring (panel button → /end → terminated → followers see ended banner with cleanup CTA).
12. Test sweep + manual QA matrix.

Each step is independently shippable — Tier 2 can roll out incrementally.
