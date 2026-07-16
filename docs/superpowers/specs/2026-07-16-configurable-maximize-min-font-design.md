# Configurable Maximize-Mode Minimum Font Size — Design

## Problem

`src/hooks/useFitToScreen.js` hardcodes `MIN_FONT = 20` — the floor below
which maximize mode's auto-fit will not shrink text. Below this floor,
auto-fit switches to pagination (splitting the song into swipeable
3-column pages) instead of shrinking further. This floor should be a
user preference instead of a fixed constant, so users can trade off
"smaller text, fewer pages" against "bigger text, more pages" to match
their own reading distance and eyesight.

## Scope

This is a narrow, single-value settings addition. It does not change
pagination logic, column math, or any other part of the maximize-mode
feature — only where `MIN_FONT`'s value comes from.

## Architecture

### Storage & state — `useDisplaySettings.js`

The existing hook (`src/hooks/useDisplaySettings.js`) persists per-UI-element
font/color settings to localStorage under `songsheet_display_*` keys and
applies them to CSS custom properties on `document.documentElement`. This
new setting is not a font/color for a UI element — it's a single numeric
threshold — so it gets its own top-level field and setter rather than
being folded into the existing `settings.<element>` shape:

- New localStorage key: `songsheet_display_maximize_min_font_size`
- New field on the hook's returned `settings` object:
  `settings.maximizeMinFontSize` (a plain number, default `18`)
- New default: add `maximizeMinFontSize: 18` to the `DEFAULTS` object
  (alongside `title`, `artist`, etc.)
- New setter: `updateMinFontSize(value)`, returned from the hook alongside
  the existing `updateElement`. It clamps `value` to the valid range
  `[8, 28]` *before* persisting (so a corrupted/out-of-range stored value
  can never be written back out uncorrected), writes it to localStorage,
  updates React state, and returns.
- `loadSettings()` gains defensive clamping on read too: after parsing
  the stored value (or falling back to the default), clamp into `[8, 28]`
  before putting it in the returned settings object. This guards against
  a value written by a future version with a wider range, or manual
  localStorage tampering.
- `resetAll()` includes `maximizeMinFontSize` in what it resets to
  default, matching how it already resets every other key.
- This setting does **not** get applied to a CSS custom property via
  `applyToDOM` — it isn't a style property, it's a numeric input to the
  `useFitToScreen` hook's own layout algorithm. `applyToDOM` is left
  untouched.

### Threading to `useFitToScreen.js`

- The hook gains a new parameter: `useFitToScreen({ enabled, containerRef,
  bodyRef, lyricsOnly, songId, minFontSize })`.
- The module-level `const MIN_FONT = 20` is deleted. Every internal
  reference to `MIN_FONT` (in `computeFlags`'s `canDecrease` check, the
  binary-search `lo` bound in `measureAuto`, the pagination-fallback font
  in `measureAuto`, and `decreaseFontSize`'s clamp) is replaced with the
  `minFontSize` parameter.
- `MAX_FONT = 28` remains a hardcoded module-level constant — the ceiling
  is not part of this feature. `minFontSize` is clamped to
  `[8, MAX_FONT]` at the point of use inside the hook as a defensive
  second layer (belt-and-suspenders with the settings-side clamp), so an
  invalid `minFontSize` prop can never produce `lo > hi` in the binary
  search or a floor above the ceiling.
- The `useLayoutEffect` that re-measures on `[enabled, lyricsOnly,
  songId]` gains `minFontSize` in its dependency array. This means
  changing the setting while a song is already maximized re-triggers
  auto-fit immediately (through the same synchronous-then-rAF-corrected
  double-pass this effect already does for other changes), rather than
  only taking effect the next time the user opens maximize mode or
  switches songs.
- The `ResizeObserver` effect's manual-mode branch (which keeps a
  user-pinned font size across a resize) does not need `minFontSize`
  directly — it calls `resultForFont(prev.fitFontSize, ...)`, which only
  consults `MAX_COLS`, not the font floor. No change needed there beyond
  what closure capture already provides implicitly through the outer
  function scope.

### Call site — `App.jsx` → `MainContent.jsx`

- `MainContent.jsx` is the sole caller of `useFitToScreen`, but it does
  **not** currently receive `displaySettings` — only `SettingsPanel` does
  (confirmed: `App.jsx` owns the `useDisplaySettings()` instance at the
  top level and passes `displaySettings` solely to `SettingsPanel`;
  `MainContent`'s own prop list, also wired up in `App.jsx`, has no such
  prop today).
- `App.jsx`'s `<MainContent ... />` call gains one new prop:
  `maximizeMinFontSize={displaySettings.settings.maximizeMinFontSize}`.
  `MainContent` does not need the whole `displaySettings` object — just
  this one number — so only the number is threaded through, not the
  settings object or its setters (`MainContent` never needs to *change*
  this setting, only read it).
- `MainContent.jsx` reads its new `maximizeMinFontSize` prop and passes it
  as `minFontSize` into the `useFitToScreen({...})` call.

### UI — `DisplayTab.jsx`

- A new standalone row is added to `DisplayTab`, alongside the existing
  per-element rows (Song Title, Artist, Lyrics, Chords, Sections,
  Annotations) but visually simpler — no font picker, no color picker, no
  expand/collapse chevron, since there's only one value to set.
- Label: "Minimum font size (maximize mode)"
- Control: a −/+ stepper matching the existing stepper's exact visual
  style (`w-6 h-6` bordered buttons, centered numeric value between
  them) — the same pattern already used for the per-element absolute
  size steppers in `ElementRow`. Step size: 1px. Range: 8–28,
  clamped in the click handlers (`Math.max(8, ...)` /
  `Math.min(28, ...)`) the same way the existing per-element size
  steppers clamp their own bounds.
- Displayed value: `${value}px`, matching the existing `sizeLabel()`
  formatting for non-offset sizes.
- Placement: added as its own row in the `DisplayTab` list, positioned
  after the six existing `ELEMENTS` rows (so it reads as a distinct,
  final "behavioral" setting rather than being interleaved with the
  visual per-element rows).
- Prop threading is simpler than a new prop path: `DisplayTab` already
  receives `settings={displaySettings.settings}` from `SettingsPanel.jsx`
  (confirmed at the call site), which is the *whole* settings object — so
  `settings.maximizeMinFontSize` is already available inside `DisplayTab`
  once it's added to `useDisplaySettings`'s state shape, with no new prop
  needed for the value. Only the setter needs a new prop:
  `SettingsPanel.jsx`'s `<DisplayTab ... />` call gains
  `updateMinFontSize={displaySettings.updateMinFontSize}`, mirroring how
  `updateElement={displaySettings.updateElement}` is already passed.
  `DisplayTab`'s function signature gains the one new prop
  `updateMinFontSize`, used by the new row's stepper handlers.

### Data flow (end to end)

```
User clicks +/- in DisplayTab
  → updateMinFontSize(newValue)          [useDisplaySettings.js]
  → clamp to [8,28], persist to localStorage, update React state
  → DisplayTab re-renders with new value
  → MainContent re-renders (displaySettings.settings.maximizeMinFontSize changed)
  → useFitToScreen's minFontSize prop changes
  → useLayoutEffect's dependency array picks up the change
  → auto-fit re-runs (synchronous pass + rAF-corrected settle pass)
  → SongBody re-renders at the new floor (or paginates if the new floor
    still doesn't fit)
```

### Testing

- `useDisplaySettings.test.js` (new file — no existing test file for this
  hook): default value is `18`; `updateMinFontSize` persists and clamps
  out-of-range input (e.g. `updateMinFontSize(999)` → stored/returned as
  `28`; `updateMinFontSize(-5)` → `8`); `resetAll` restores it to `18`;
  loading a corrupted/out-of-range stored value clamps on read.
- `useFitToScreen.test.js`: existing tests that assert `fitFontSize` lands
  on `20` (there are several, per a pre-flight grep) need their
  `minFontSize` param made explicit in the `renderHook` call rather than
  relying on an implicit default, since the hook no longer has one — every
  call site must supply `minFontSize`. Add new tests: a non-default
  `minFontSize` (e.g. `14`) changes where the binary search's floor sits
  and where pagination kicks in; changing `minFontSize` while `enabled`
  is already `true` re-triggers auto-fit (dependency array coverage).
- `DisplayTab.test.jsx` (new file): stepper renders `18px` by default;
  clicking `+`/`−` calls the setter with clamped values at the 8/28
  boundaries; the new row renders without a font picker, color picker, or
  expand/collapse chevron (confirming it's visually distinct from the
  per-element rows, per the UI section above).
- No real-browser verification is needed for this feature — it's a plain
  numeric threshold change, not new layout/measurement logic. The
  existing real-browser-verified pagination math (`measurePagination`,
  the paginated flow's translate math) is untouched by this change.

## Non-goals

- No change to `MAX_FONT` (28) — stays a fixed ceiling.
- No per-song override — this is a single global setting, per the
  brainstorm decision.
- No slider UI — stepper only, matching existing `DisplayTab` patterns.
- No change to pagination's column math, `measurePagination`, or the
  paginated flow's rendering — only the font-size floor that decides
  *when* pagination is needed changes; how pagination itself computes
  and renders is untouched.
