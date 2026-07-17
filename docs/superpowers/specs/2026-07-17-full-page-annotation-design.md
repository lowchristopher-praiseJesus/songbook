# Full-page annotation area for non-paginated songs

## Problem

In Maximize mode, the annotation ink canvas (`AnnotationLayer.jsx`) is only
ever mounted around the lyrics content box — it sizes itself to whatever box
it's placed in, and today that box is `SongBody`'s own lyrics wrapper. The
song title (with key/tempo) renders as a separate sibling above it in
`SongList.jsx`, entirely outside the canvas's bounds, and the vertical
padding above/below the lyrics box within the page is likewise outside it.

For a song that doesn't fill the whole screen (the common case — "fit to
screen" actively shrinks/grows font size to use the available space, but
short songs still leave blank margin above/below), the user can only draw
within the tight lyrics box, not in the blank space around it or over the
title.

## Goal

Make the entire visible page — title, key/tempo line, top/bottom padding,
and lyrics — one annotatable surface, for songs that fit on a single screen
without pagination.

## Scope

**In scope:** non-paginated songs in Maximize mode (`paginated` false, the
vast majority — pagination is a fallback for songs too long to fit even at
minimum font size).

**Out of scope:** paginated (multi-page) songs. Their annotation canvas
already lives inside the CSS multi-column flow container that does the
pagination math, and that container's padding must stay byte-identical
between the live render and the shadow measurement pass in
`useFitToScreen.js` (`measurePagination`) — a mismatch there previously
caused a class of overflow/blank-page bugs (see
`2026-07-16-maximize-pagination-design.md` and the pagination cross-song
fix). Covering paginated songs' margins would require a second,
non-sliding canvas layered underneath the existing one plus a
region-tagged stroke data model change — real, contained work, but a much
smaller win (a ~16px margin band) than the non-paginated case. Left as a
possible follow-up. Paginated songs keep exactly today's annotation
behavior: canvas hugs the lyrics content only, title stays where it is,
no extra margin.

**Already-annotated songs are unaffected.** `annotationStore.captureBaseline`
is a no-op once a song already has a `baseline` — existing ink stays exactly
where it was captured. Only a song's *first* stroke, drawn after this change
ships, captures the wider baseline.

## Architecture

### Shared title markup

Extract the existing title/key/tempo JSX (currently inline in
`SongList.jsx`, the `{isFit && <div className="mb-4">...}` block) into a new
presentational component, `src/components/SongList/SongTitleBlock.jsx`:

```jsx
export function SongTitleBlock({ title, songKey, tempo }) { ... }
```

Pure rendering, no behavior change — same markup, same classes
(`font-bold leading-tight`, `--title-font`/`--title-size`/
`--title-color-active` CSS vars, the `Key: … · BPM: …` line). Used by both
`SongList.jsx` (paginated songs) and `AnnotatedMaximizeView.jsx`
(non-paginated songs) so the two call sites can't visually drift apart.

### Where the title renders

Both call sites need to agree on the *effective* paginated state — not the
raw live `paginated` prop, which goes stale once `useFitToScreen` is
disabled (after a baseline is captured; see `MainContent.jsx`'s existing
`effectivePaginated` computation). `SongList.jsx` doesn't currently read the
annotation store; it will start doing so, mirroring the pattern already
established in `MainContent.jsx`:

```js
const baseline = useAnnotationStore(s => s.baseline)
const effectivePaginated = baseline ? !!baseline.paginated : paginated
```

- `SongList.jsx` renders `<SongTitleBlock>` in its current spot **only when
  `effectivePaginated` is true**. Paginated songs: zero change from today.
- `AnnotatedMaximizeView.jsx` renders `<SongTitleBlock>` **when
  `effectivePaginated` is false** (new), as the first child inside the same
  wrapper as `SongBody`, in both its live (pre-baseline) and frozen
  (post-baseline, CSS-scaled) render branches. Needs two new props:
  `title`, and either `songKey`/`tempo` or a `meta` object — `SongList.jsx`
  already has `song.meta` in scope, so it just threads the same three
  values it already reads today.

Because the paginated/non-paginated branch is mutually exclusive and always
resolves to exactly one of the two components rendering the title, there's
no risk of a duplicate-title or missing-title flash — the branch flips
atomically with `effectivePaginated` in the same render.

### Where the canvas mounts

Today, `AnnotationLayer` is passed into `SongBody`'s `overlay` slot, which
appends it as the last child inside `SongBody`'s own lyrics wrapper —
sizing the canvas to exactly that box.

For the non-paginated path only, `AnnotatedMaximizeView.jsx` stops passing
`overlay` into `SongBody` and instead renders `AnnotationLayer` itself, as a
sibling `absolute inset-0` over a new wrapper containing both
`SongTitleBlock` and `SongBody` — so canvas bounds = title + margin +
lyrics, matching the goal directly.

Concretely, in `AnnotatedMaximizeView.jsx`:

- **Live branch** (no `baseline` yet): today this is
  `<div ref={bodyRef} className="relative"><SongBody overlay={<AnnotationLayer/>} /></div>`.
  For the non-paginated case this becomes a new outer `relative` div
  containing `<SongTitleBlock>`, then a plain `<div ref={bodyRef}><SongBody /></div>`
  (no `overlay` prop), then `<AnnotationLayer>` as the last sibling,
  `absolute inset-0` on the outer div. The paginated case keeps today's JSX
  byte-for-byte.
- **Frozen branch** (`baseline` set): today the `absolute top-0 left-0`
  box (sized `baseline.width`/`baseline.height`, CSS-scaled via
  `transform: scale(...)`) contains only `SongBody`. For the non-paginated
  case (`!baseline.paginated`) it gains `<SongTitleBlock>` as its first
  child, and `AnnotationLayer` moves from `SongBody`'s `overlay` slot to
  being a direct sibling inside that same scaled box — so title, lyrics,
  and ink all scale together as one unit under fit-to-screen/pinch-zoom.
  The paginated case (`baseline.paginated`) keeps today's JSX.

`bodyRef` itself is **not** moved — it stays on the inner div wrapping only
`SongBody`, exactly as today. `useFitToScreen`'s `getAvailableHeight()`
depends on `bodyRef`'s position to account for title height already
consuming space above it; repointing `bodyRef` to the new outer wrapper
would break that math. Since the new outer wrapper is purely an added
ancestor around the existing `bodyRef` div (not a replacement for it), this
change is confined to rendering and canvas placement — it does not touch
`useFitToScreen` or any column/font-fit calculation.

### Baseline capture

No changes needed to `AnnotationLayer.jsx`'s capture logic. Its
`onPointerUp` handler already computes the non-paginated baseline
`width`/`height` from `canvas.clientWidth`/`canvas.clientHeight` — i.e.
whatever box the canvas happens to be mounted in. Once the canvas is
mounted on the bigger (title + lyrics) wrapper, it captures the full page
size automatically.

### Scaling

`AnnotatedMaximizeView`'s `fitScale` (computed from `baseline.width`/
`baseline.height` vs. the live container size) is agnostic to what's inside
the box — it continues to work unchanged. The practical effect: the title
now visually scales up/down together with the lyrics under fit-to-screen
and pinch-zoom, instead of staying a fixed size while only the lyrics
scaled. This is an intentional, reasonable side effect of the box growing
to be "the whole page" — not a separate feature to build.

## Data flow summary

```
SongList.jsx
  reads: song.meta.{title,key,tempo}, annotationStore.baseline
  computes: effectivePaginated
  ├─ effectivePaginated → renders <SongTitleBlock> itself (unchanged path)
  └─ !effectivePaginated → passes title/key/tempo down to AnnotatedMaximizeView,
                            renders no title itself

AnnotatedMaximizeView.jsx
  receives: title, songKey, tempo (new props)
  ├─ paginated → today's JSX, unchanged (overlay inside SongBody, no title)
  └─ !paginated → <SongTitleBlock> + <SongBody> (no overlay prop) + <AnnotationLayer>,
                  all siblings inside one relative wrapper (live) or one
                  scaled box (frozen)
```

## Edge cases

- **Transient/unsettled `paginated` during initial fit measurement:** the
  live `paginated` prop from `useFitToScreen` starts `false` before
  settling. `effectivePaginated` being `false` during that window means the
  title renders via the new (non-paginated) path by default, which is
  correct for the majority case and simply flips to the old path if/when
  `paginated` resolves `true` — same render, no flash.
- **Song switch while a baseline exists for the new song:** `baseline`
  comes from the annotation store keyed by the currently loaded song (see
  `annotationStore.loadForSong`, already wired to fire on `activeSongId`
  change); `effectivePaginated` recomputes correctly per-song, same as
  `MainContent.jsx`'s existing `effectivePaginated`.
- **A song's baseline was captured before this change shipped:** unaffected
  — `captureBaseline` is a no-op when a baseline already exists, so that
  song keeps rendering with its old, smaller canvas box. No migration.
- **Erasing:** `eraseStrokeAt` operates on the active layer's strokes by
  proximity in canvas-pixel space; no changes needed since there's still
  exactly one canvas/coordinate space for a non-paginated song (unlike the
  two-canvas idea considered and rejected for the paginated case).

## Testing

- `SongTitleBlock.test.jsx` (new): renders title; renders key/tempo line
  only when present; matches existing markup/classes exactly (snapshot or
  explicit class assertions, not a new visual behavior).
- `AnnotatedMaximizeView` tests: non-paginated live branch renders
  `SongTitleBlock` before `SongBody`, with `AnnotationLayer` sized to the
  outer wrapper (not nested inside `SongBody`'s overlay slot); paginated
  branch (live and frozen) is byte-for-byte unchanged from today — assert
  this explicitly so a future edit can't accidentally widen scope back into
  the excluded paginated case.
- `SongList.jsx` tests: paginated song renders `SongTitleBlock` in
  `SongList`'s own tree; non-paginated song does not (delegates to
  `AnnotatedMaximizeView` instead); title text/key/tempo values thread
  through correctly either way.
- Baseline-capture test: first stroke on a non-paginated song captures a
  `baseline.width`/`height` matching the full title+lyrics wrapper's
  measured size (bigger than the old lyrics-only box), using the same
  DOM-measurement-fake pattern as `MainContent.pagination.integration.test.jsx`.
- Regression: `MainContent.pagination.annotation.test.jsx` and
  `MainContent.pagination.crossSongAnnotation.test.jsx` continue to pass
  unchanged (both exercise paginated songs with an annotation baseline).
