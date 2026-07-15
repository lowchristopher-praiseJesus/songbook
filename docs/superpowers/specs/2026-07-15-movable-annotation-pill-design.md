# Movable annotation control pill

## Problem

`AnnotationToolbar.jsx` (the pen/eraser/color/layer control pill shown in
Maximize mode while annotating) is hardcoded to
`fixed left-4 top-1/2 -translate-y-1/2` with no drag logic. On some songs,
especially at certain zoom/font-size levels, that fixed left-center spot can
sit over lyrics or chords the user needs to see, with no way to move it out
of the way.

## Goal

Let the user drag the pill to any position on screen (free 2D movement, not
just up/down), and remember that position across sessions.

## Interaction flow

- The pill gains a small grip handle (visually consistent with the existing
  two-bar grip used by the floating-controls pill in normal mode). Only the
  grip initiates a drag — clicking pen/eraser/color/layer buttons behaves as
  today and never starts a drag.
- Pointer-down on the grip, then pointer-move, updates the pill's `left`/
  `top` to track the pointer in both axes. Pointer-up ends the drag and
  persists the position.
- The pill is clamped to stay within the viewport (`8px` margin on all
  sides) so it can never be dragged fully off-screen and out of reach.
- Avoiding overlap with lyrics/chords is the user's responsibility — the
  pill does not detect or avoid song content. This matches the existing
  floating-controls pill, which has no content-collision logic either.
- Position persists via `localStorage` (new key
  `songsheet_annotation_pill_pos`, storing `{x, y}`) and is restored next
  time the pill is shown. Before any drag has ever happened, it renders at
  today's default position (left-center).
- No reset-to-default control and no resize-responsive repositioning — out
  of scope, consistent with the existing floating-controls pill.

## Architecture

- **New hook** `src/hooks/useDraggablePill.js`: given a `storageKey` and a
  ref to the pill element, returns `{ position, gripProps }`.
  - `position` is `{ left, top } | null` (`null` = use default CSS
    position).
  - `gripProps` is spread onto the grip element: `onPointerDown` starts the
    drag, capturing the pill's `getBoundingClientRect()` and pointer offset
    within it.
  - Internally mirrors the pointer-tracking mechanics already used by
    `MainContent.jsx`'s inline floating-controls drag (`pointermove`/
    `pointerup` listeners on `window`, cleanup on unmount) but tracks both
    axes instead of one, and clamps both `x` and `y` against
    `window.innerWidth`/`innerHeight` minus the pill's measured size.
  - Persists to `localStorage` on `pointerup` only (not on every move), same
    as the existing pattern.
- The existing inline drag code in `MainContent.jsx` is **not** refactored
  to use this hook — it works today and touching it isn't needed for this
  task. The new hook exists standalone for the annotation pill; a future
  cleanup could migrate `MainContent.jsx` onto it, but that's out of scope
  here.
- `AnnotationToolbar.jsx` changes:
  - Add the grip element (icon + `gripProps`) inside the pill, above the
    existing pen/eraser controls.
  - Replace the Tailwind positioning classes (`fixed left-4 top-1/2
    -translate-y-1/2`) with `fixed` (for `z-20` stacking/layout only) plus
    inline `style={{ left, top }}` when `position` is non-null, falling back
    to the current class-based default position when `position` is `null`.

## Edge cases

- First-ever use (no localStorage entry): renders at today's default
  position, matching current behavior exactly.
- Window resized after a position was saved (e.g. rotating a tablet):
  clamping only re-applies on the next drag, not automatically on resize —
  the pill could end up partially off-screen until next dragged. This
  matches the existing floating-controls pill's behavior and is accepted as
  out of scope.
- Touch/stylus input: `touch-none` on the grip prevents the browser's
  native touch-scroll/gesture handling from fighting the drag, consistent
  with the existing pill's grip.
- Dragging near screen edges: clamped to an 8px margin so the grip always
  remains reachable for a subsequent drag.

## Testing

- `useDraggablePill.test.js`: pointerdown/move/up sequence updates position;
  clamping keeps position within viewport bounds; position is written to
  `localStorage` on pointerup and read back on next mount; `null` position
  when no stored value exists.
- `AnnotationToolbar.test.jsx`: grip renders and has `onPointerDown` wired;
  clicking a tool button (pen/eraser/color/layer) does not trigger a drag;
  pill applies inline `left`/`top` style once a position exists in
  `localStorage`.
