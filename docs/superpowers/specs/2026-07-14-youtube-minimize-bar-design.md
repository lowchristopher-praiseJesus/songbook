# YouTube minimize bar

## Problem

The "YouTube" button on a song opens `YoutubeSearchModal`, a full-screen modal
(`Modal.jsx`: `fixed inset-0` with a black backdrop) that plays the picked
video in an embedded iframe. While that modal is open it completely covers
the song lyrics, so a user can't sing along while watching/listening to the
reference video — they have to close the video to see the words again.

## Goal

Add a "minimize" control to the YouTube player so the user can shrink it to
a small sticky bar and keep it playing (audio + video) while the lyrics are
fully visible and scrollable underneath.

## Interaction flow

- The YouTube modal gains a minimize icon button next to the existing ✕
  close button. It is shown only while a video is actively playing (modal
  `status === 'playing'`) — not during search/idle/results states.
- Clicking minimize closes the full-screen modal overlay but keeps the video
  playing, and shows a bar fixed to the bottom of the viewport:
  `▶ {song title} — {artist}` with **Expand** and **Close** controls.
  - **Expand** reopens the full modal, video continues from the same
    playback position.
  - **Close** stops playback entirely and dismisses the bar.
- Clicking the existing "YouTube" header button again while minimized
  re-expands to the full modal (same behavior as Expand).
- Navigating away from the current song (e.g. back to the library list, or
  opening a different song) stops playback and removes the bar. The player
  is scoped to the current song view, not a global/app-wide mini-player.
- The ✕ close button on the full modal always fully stops playback (it does
  not minimize).

## Architecture

**Constraint:** the YouTube `<iframe>` must not be unmounted/remounted when
toggling between the full modal and the minimized bar — recreating the
iframe reloads the embed and restarts playback from the beginning. The
design decouples *where the player is mounted* from *how it's displayed*.

- **State** moves from `YoutubeSearchModal`'s local open/closed boolean into
  a single `ytPlayerState: 'closed' | 'modal' | 'minimized'` owned by
  `SongHeader` (which already owns `ytModalOpen` today), alongside the
  current `videoId`.
- **New component `YoutubePlayerBar`** owns the actual `<iframe>` element.
  It mounts whenever `ytPlayerState !== 'closed'` and renders differently
  depending on state, but keeps the same React element (same `key`) across
  both visual states so React reconciles it in place rather than
  destroying/recreating it:
  - `modal`: renders inside the existing `Modal` chrome (backdrop, centered
    box, title) — visually identical to today's "playing" state.
  - `minimized`: renders as the fixed bottom bar; the iframe itself is
    restyled to be visually tucked away (not `display: none`, which some
    browsers use to pause background media — instead sized/positioned so it
    isn't visible) rather than removed from the tree.
- `YoutubeSearchModal`'s search/results flow (idle → searching → results →
  playing) is unchanged and still only rendered in the `modal` visual state.
  Minimizing is only available once `status === 'playing'`.
- The iframe unmounts only when `ytPlayerState` becomes `'closed'` (explicit
  Close/Stop, or the song view itself unmounts on song switch via normal
  effect cleanup).

## Edge cases

- Song switch while minimized: the song view's unmount cleans up
  `YoutubePlayerBar`, stopping playback (matches "scoped to current song").
- No video ever picked (`ytPlayerState: 'closed'`, no `videoId`): minimize
  button doesn't apply; behavior identical to today.
- Rapid modal/minimize toggling: the three-state machine prevents invalid
  transitions; the iframe `src` only changes when `videoId` changes, never
  on `modal` ⇄ `minimized` toggles.
- Mobile viewport: the bottom bar uses safe-area padding so it doesn't
  collide with the existing mobile swipe-hint overlays in
  `MainContent.jsx` (`fixed bottom-4` / `fixed bottom-20` elements).

## Testing

- `YoutubeSearchModal.test.jsx` / new `YoutubePlayerBar.test.jsx`: minimize
  button appears only in `playing` state; clicking it hides modal chrome and
  shows the bar; the iframe is not remounted across the transition (assert
  via a stable test id rather than relying on instance identity); Expand and
  Close controls transition `ytPlayerState` correctly.
- `SongHeader.test.jsx`: `ytPlayerState` resets to `closed` on song switch /
  component unmount.
