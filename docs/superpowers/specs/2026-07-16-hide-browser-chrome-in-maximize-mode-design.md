# Hide browser chrome in maximize mode

## Problem

When a user enters maximize mode (the existing full-viewport chord-chart overlay, `isFit` state in `src/components/SongList/MainContent.jsx`), the browser's own UI — address bar, tabs, bookmarks bar on desktop; address bar and system nav on mobile/tablet — still consumes screen space. The goal is to give the song sheet as much of the physical screen as each platform allows, in-tab (no app install required), across desktop, tablet, and phone.

## Constraints

- Must work as a regular browser tab. No PWA install step (ruled out explicitly — users just open the URL).
- iPhone Safari has no Fullscreen API support for arbitrary page content in a regular tab (long-standing WebKit limitation, `document.fullscreenEnabled` is `false` there). This is an OS-level ceiling we cannot code around; the design accounts for it rather than fighting it.
- Detection must be by runtime feature capability, not device/UA sniffing — UA strings are brittle and WebKit's supported surface has shifted over time (e.g. iPad Safari's status), so `document.fullscreenEnabled` / presence of `element.requestFullscreen` is the source of truth, not a device list.

## Approaches considered

1. **Feature-detected native Fullscreen API + CSS fallback (chosen).** Try `requestFullscreen()` on the same click that opens maximize mode; wherever supported, this hides all browser chrome plus the OS taskbar. Wherever unsupported, fall back to viewport-unit and safe-area CSS plus a scroll-collapse nudge.
2. **CSS-only everywhere (rejected).** Simpler (one code path), but leaves visible browser chrome on desktop and Android Chrome where the Fullscreen API could remove it entirely — doesn't meet the "maximum space" goal on platforms that support better.
3. **User-agent sniffing (rejected).** Branching on "is this an iPhone" via UA string instead of feature detection. Brittle against spoofing and against WebKit/Apple changing what's supported over time; feature detection is the durable choice.

## Design

### Trigger & platform behavior

The existing maximize button click becomes a single action that does two things:
1. Sets `isFit = true` (existing CSS overlay — unchanged).
2. Best-effort calls `requestFullscreen()` on the maximize overlay element, feature-detected first (checks for the method's existence / `document.fullscreenEnabled`). If unsupported or the call rejects, this step is silently skipped — it never blocks or errors the maximize action itself.

Resulting behavior per platform:
- **Desktop** (Chrome/Firefox/Safari/Edge): full OS-level fullscreen — tab bar, address bar, bookmarks bar, and taskbar all hidden. The browser shows its own transient "Press Esc to exit" banner; the app does not duplicate this messaging.
- **Android Chrome / Android tablets**: Fullscreen API hides the address bar and system nav bar the same way.
- **iPad Safari**: uses the Fullscreen API if the runtime reports support (feature-detected, never assumed by device type); if unsupported at runtime, falls through to the same path as iPhone.
- **iPhone Safari**: always uses the CSS fallback path (see below) — there is no native fullscreen available to page content in-tab here.

### CSS fallback (unsupported browsers, primarily iPhone Safari)

- Maximize overlay sizing switches from `100vh`/viewport-unit-based height to `100dvh` (dynamic viewport height), so the layout doesn't jump or leave a gap as Safari's chrome shows/hides during scroll.
- `index.html`'s viewport meta tag gains `viewport-fit=cover`; the maximize overlay's outer container gets `env(safe-area-inset-*)` padding so the top-right control cluster and song content aren't obscured by the notch or home indicator when the layout goes edge-to-edge.
- On entering maximize mode when the Fullscreen API is unsupported, a scroll-nudge (the standard "scroll page by ~1px" technique) runs once to encourage Safari to collapse its address bar to the thin sliver it allows. This is progressive enhancement — if it does nothing, the layout is still correct, just with the address bar visible.

### State sync & error handling

- `exitMaximize()` additionally calls `document.exitFullscreen()` when `document.fullscreenElement` is set, so the exit button reverses both the CSS overlay and native fullscreen together.
- A `fullscreenchange` listener is active while `isFit` is true. If the user exits native fullscreen through browser-native means (Esc key, browser's own exit control, OS gesture) rather than the app's exit button, this event fires and the handler calls `exitMaximize()` — preventing a half-state where native chrome is back but the CSS overlay still covers the screen.
- `requestFullscreen()` promise rejection (e.g. blocked by permissions policy, or a browser quirk) is caught and ignored. The CSS maximize overlay already applied stands on its own; the feature degrades to "as good as CSS can do" rather than failing the maximize action.
- No new user-facing error states are introduced — this is additive/best-effort on top of the maximize mode that already works today.

### Implementation touch points

- `index.html` — add `viewport-fit=cover` to the viewport meta tag.
- `src/components/SongList/MainContent.jsx` — maximize overlay (`~line 286` onward): switch viewport-unit sizing to `100dvh`; add safe-area-inset padding to the overlay's outer container; wire the fullscreen request into the maximize-button handler and into `exitMaximize()`; add the `fullscreenchange`-listener effect scoped to `isFit`.
- New hook `src/hooks/useNativeFullscreen.js` encapsulating feature-detected request/exit/listener logic, keeping `MainContent.jsx` free of inline fullscreen-specific branching and making the logic independently testable.

### Testing

- `src/components/SongList/__tests__/MainContent.fitMode.test.jsx` (existing) and any new tests need `document.documentElement.requestFullscreen`, `document.exitFullscreen`, and `document.fullscreenEnabled` stubbed in jsdom (which doesn't implement the Fullscreen API), so calling them doesn't throw and so invocation can be asserted.
- New unit tests for `useNativeFullscreen`: supported path calls `requestFullscreen`/`exitFullscreen` and reacts to `fullscreenchange`; unsupported path (no `requestFullscreen` on the element) is a no-op that doesn't throw.
- The iOS scroll-nudge and `dvh`/safe-area CSS are not meaningfully testable in jsdom (no real viewport or Safari chrome to simulate) — verified manually on an actual iPhone as a manual test step, not automated.

## Out of scope

- PWA install / home-screen manifest changes (explicitly ruled out — must work in a regular tab).
- Any behavior change to maximize mode when the Fullscreen API request fails or is unsupported beyond the CSS fallback described above.
