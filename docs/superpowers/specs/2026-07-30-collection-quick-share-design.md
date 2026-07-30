# Collection Quick-Share Button — Design

## Problem

`CollectionDetailView` (the collections page) is where a user manages a collection they already have a share link for — but there's no quick way to hand that same link to someone else. Getting the URL/QR today requires going through the sidebar's multi-step export flow (select songs → choice modal → "Share via link" → `ShareModal`), which is built around *creating or pushing* a share, not just re-displaying an existing one.

Separately, the action button list on this page (Add Songs, Search Songs, Rename, Duplicate, Check for Updates, Delete Collection) is already six stacked full-width buttons. Adding a seventh as another full-width button would push the page past half a screen of buttons before any songs are visible.

## Goal

1. Add a lightweight way, from the collections page, to see a collection's existing share URL and QR code and hand them to someone else — no new link is created, it just surfaces the link the collection already has.
2. Do this without growing the vertical button stack — restructure the secondary actions (Rename, Duplicate, Check for Updates, and the new Share) into a compact icon toolbar row, consistent with the icon-button pattern already used for these same actions in the sidebar's `CollectionGroup`.

## Non-goals

- No new data model field to distinguish "collection I imported from someone else" from "collection I created and shared myself." Per decision below, visibility is gated purely on `collection.shareCode` presence (matching the existing "Check for Updates" gate) — the button will also appear on collections the user originated and shared themselves.
- No change to `ShareModal`'s flow, `CollectionGroup.jsx` (sidebar), or the sidebar's export-mode share flow.
- No creation of a new share link, no Push Update — purely reads and displays the collection's existing `shareCode`.
- No change to `Rename` / `Duplicate` behavior beyond moving their trigger from a full-width button to an icon.

## Design

### Visibility gate

Reuses the exact condition the existing "Check for Updates" button already uses: `collection?.shareCode && !linkExpired`. No new collection field.

### Expiration detection (upgraded from reactive to proactive)

Today, `linkExpired` is only set reactively, after the user clicks "Check for Updates" and the server returns 410. On page load it's always `false`, so a dead link's actions would briefly appear until acted on.

Add a `useEffect` in `CollectionDetailView` that runs when `collection?.shareCode` is present: call `checkShareVersion(collection.shareCode)` once (same call `ShareModal` already makes on open) and set `linkExpired` from a 410 response (or from `expiresAt` having already passed). This means the icon row correctly omits Share/Check-for-Updates immediately on load rather than only after a failed action. No other behavior of `checkShareVersion` changes.

### Action area layout

Replaces the current stacked-button list with:

1. **Add Songs** — full-width button (unchanged)
2. **Search Songs** — full-width button (unchanged)
3. **Icon toolbar row** — small square icon buttons, left-aligned in one row, each with a tiny text label underneath (visible labels, not hover-only tooltips — this is a touch-first primary page, unlike the sidebar's hover-revealed icons):
   - ✏️ Rename — always shown; opens the existing inline rename input (unchanged behavior, new trigger)
   - ⧉ Duplicate — always shown; opens the existing inline duplicate input (unchanged behavior, new trigger)
   - 🔗 Share — shown only when `collection.shareCode && !linkExpired`; new behavior, see below
   - ↻ Check for Updates — shown only when `collection.shareCode && !linkExpired`; same `handleCheckUpdates` logic as today, now icon-triggered; shows a spinner/`…` state while `refreshing`
   - If `collection.shareCode` is set but `linkExpired` is true, the Share and Check-for-Updates icons are omitted and a small "Link expired" caption appears under the row instead (replacing today's separate expired-text paragraph)
4. Divider (unchanged)
5. **Delete Collection** — full-width danger button (unchanged). Kept full-width and visually separated rather than folded into the icon row, since it's destructive and deserves a distinct, harder-to-mis-tap affordance.

### Share icon behavior (the new feature)

Clicking 🔗 toggles a `shareRevealOpen` boolean. When open, an inline panel renders beneath the icon row (no modal) containing:

- A label ("Share link")
- A read-only text input with the share URL: `${window.location.origin}/?share=${collection.shareCode}` (same construction `ShareModal` already uses for `existingShareUrl`)
- A **Copy** button — `navigator.clipboard.writeText`, with the same transient "Copied!" label swap `ShareModal.handleCopy` already uses
- A QR code, rendered via `QRCode.toCanvas(canvasRef.current, shareUrl, { width: 220, margin: 2 })` — same call signature `ShareModal` uses for its member-link QR, in a `useEffect` keyed on `shareRevealOpen`
- A **Save QR** button reusing `ShareModal`'s existing `handleDownloadQr` pattern (QR + collection name + expiry date composited into a downloadable PNG)

Clicking 🔗 again collapses the panel. No network calls happen when opening/closing — the URL is derived from data already in the store, and the QR is generated client-side.

### Testing

Add coverage (likely a new `CollectionDetailView.quickShare.test.jsx` alongside the existing `CollectionDetailView.deleteConductor.test.jsx` / `.searchUG.test.jsx`):

1. Collection with no `shareCode` → no Share or Check-for-Updates icon renders; Rename/Duplicate icons still do.
2. Collection with `shareCode` and an unexpired link (mocked `checkShareVersion` resolving normally) → Share and Check-for-Updates icons render.
3. Collection with `shareCode` where `checkShareVersion` rejects with `code: 'expired'` → Share and Check-for-Updates icons do not render; "Link expired" caption does.
4. Clicking 🔗 toggles the inline panel open, showing the correct URL text and invoking `QRCode.toCanvas`; clicking again closes it.
5. Copy button copies the expected URL and shows the transient "Copied!" state.
6. Rename and Duplicate icons still trigger their existing inline-edit flows (regression check after moving them off full-width buttons).

## Open questions

None — layout (icon toolbar row, option A) and the shareCode-only visibility gate (no new data field) were both confirmed with the user during brainstorming.
