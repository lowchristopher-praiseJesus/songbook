# Annotation pill orientation flip

## Problem

The annotation control pill (`AnnotationToolbar.jsx`, made freely draggable
in [[2026-07-15-movable-annotation-pill-design.md]]) always renders as a
vertical stack. When dragged to the top or bottom edge of the screen, a tall
vertical pill wastes horizontal space and can run off the top/bottom of the
viewport on short screens. It should become a horizontal strip near the
top/bottom edges, and stay vertical near the left/right edges.

## Goal

Live orientation switching, driven purely by proximity to the nearest
screen edge — no new user-facing controls, no separate persisted setting.

## Interaction flow

- While dragging (and on initial mount from a stored position), the pill's
  orientation is derived from its center point's distance to the four
  window edges. Closest edge is `top`/`bottom` → horizontal; closest edge is
  `left`/`right` → vertical.
- The flip happens live, mid-drag, not just on drop.
- To prevent flicker near corners (where the top/bottom distance and
  left/right distance are nearly equal), orientation only changes when the
  new candidate edge is closer than the current orientation's edge by more
  than a small hysteresis margin (24px). Otherwise the last orientation is
  kept.
- With no stored position (first-ever use), the pill renders at its current
  default (left-center) and is `vertical`, matching today's behavior
  exactly.
- Orientation is derived from position on every render/drag update — it is
  never persisted as separate state. Restoring a saved position on mount
  recomputes orientation the same way a live drag would.

## Layout changes (`AnnotationToolbar.jsx`)

Full transpose of every internal group when `orientation === 'horizontal'`:

| Element | Vertical (current) | Horizontal |
|---|---|---|
| Outer container | `flex-col`, `py-2 px-1.5` | `flex-row`, `px-2 py-1.5` |
| Grip handle | two horizontal bars stacked vertically | two vertical bars side by side |
| Pen/Eraser group | `flex-col` | `flex-row` |
| Color swatches | `grid-cols-2` (2×3) | `grid-cols-3` (3×2) |
| Layer rows (3) | `flex-col` | `flex-row` |
| Undo/Reset group | `flex-col` | `flex-row` |

Each layer row's internal contents (number button + eye-toggle button) are
already laid out horizontally and are unchanged by this work.

## Architecture

- `useDraggablePill.js` gains the orientation computation:
  - A `getOrientation(position, pillEl)` helper computes the pill's center
    from `position` plus `pillEl.offsetWidth/offsetHeight`, measures
    distance to all four window edges, and returns `'horizontal'` or
    `'vertical'`, applying the 24px hysteresis against the previously
    returned orientation (tracked in a ref, defaulting to `'vertical'`).
  - Called from the existing `onMove` handler (so it updates live during
    drag) and once on mount when restoring a stored position.
  - The hook's return value gains `orientation` alongside the existing
    `position`, `pillRef`, `gripProps`.
- `AnnotationToolbar.jsx` reads `orientation` from the hook and switches the
  className/grid strings per the table above. No new props, no new
  persisted keys.
- Resize handling: a `ResizeObserver` on `pillRef` re-runs the existing
  `clamp()` whenever the pill's rendered size changes (e.g., right after an
  orientation flip changes its width/height), so a position that was valid
  in one orientation doesn't get pushed off-screen in the other. This
  observer is new — the prior movable-pill work explicitly left
  resize-responsive repositioning out of scope; this is a narrower case
  (self-inflicted size change from orientation flip, not a window resize)
  and is needed for correctness here.

## Edge cases

- Corner drags: hysteresis (above) prevents rapid flip-flopping between
  orientations as the pointer moves diagonally near a corner.
- Orientation flip mid-drag changes the pill's own width/height, which
  would otherwise invalidate the clamp computed earlier in the same drag;
  the `ResizeObserver`-triggered re-clamp handles this.
- First-ever use (no stored position): renders vertical at the default
  left-center position, unchanged from current behavior.
- Window resize (not caused by orientation flip) remains out of scope, per
  the existing movable-pill spec.

## Testing

- `useDraggablePill.test.js`: orientation is `'vertical'` by default/no
  stored position; a position closest to the top or bottom edge yields
  `'horizontal'`; a position closest to left/right yields `'vertical'`;
  hysteresis keeps the previous orientation when the new candidate edge is
  only marginally closer (within 24px); orientation updates on every
  `onMove` call during a drag, not only on drop.
- `AnnotationToolbar.test.jsx`: with a mocked/forced horizontal orientation,
  the outer container, pen/eraser group, color grid, layer rows, and
  undo/reset group all render with the horizontal classes; vertical
  orientation (default) renders the current classes unchanged.
