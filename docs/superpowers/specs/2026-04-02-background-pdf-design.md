# Background Image for Presentation PDF — Design Spec

**Date:** 2026-04-02  
**Scope:** `exportPresentationPdf` only (16:9 landscape format)

---

## Overview

When the user triggers a Presentation PDF export, a modal prompts them to confirm (and optionally replace) the background image before the PDF is generated. The default background is `Background.png` (parchment/cream texture with crown of thorns and blood-drop logo). The choice is one-time — it is not persisted.

---

## Data Flow

1. User clicks "Presentation PDF" in the Sidebar export menu.
2. `handleChoosePresentationPdf` in `Sidebar.jsx` opens `ExportBackgroundModal` (instead of calling the export directly).
3. The modal loads the default `Background.png` (Vite asset import) into an `HTMLImageElement` on mount.
4. User optionally picks a replacement image file (`image/*`) — preview updates live.
5. User clicks **Export** → modal calls `exportPresentationPdf(songs, bgImage)` → closes.
6. User clicks **Cancel** → closes with no export.

`exportPresentationPdf` receives an already-loaded `HTMLImageElement` and remains **synchronous**. The modal owns all image loading.

---

## New Component: `ExportBackgroundModal`

**File:** `src/components/Sidebar/ExportBackgroundModal.jsx`

**Props:**
| Prop | Type | Description |
|---|---|---|
| `isOpen` | `boolean` | Controls visibility |
| `songs` | `Array` | Songs to export |
| `onClose` | `function` | Close callback |
| `onAddToast` | `function` | Error toast callback |

**State:**
- `previewUrl` — starts as the Vite-imported default background URL; updated when user picks a file
- `bgImage` — the loaded `HTMLImageElement`; starts `null`, set after default loads on mount

**Behaviour:**
- On mount: creates an `HTMLImageElement`, sets `src` to the default background URL, stores it in `bgImage` on load
- File input (`accept="image/*"`): on change, reads the file via `FileReader` as a data URL, creates a new `HTMLImageElement`, updates `previewUrl` and `bgImage`
- Preview: a 16:9 `<img>` spanning the modal width, showing `previewUrl`
- **Export** button: disabled while `bgImage` is null (still loading); on click, calls `exportPresentationPdf(songs, bgImage)` in a try/catch (error → `onAddToast`), then `onClose()`
- **Cancel** button: calls `onClose()`

---

## Changes to `exportPresentationPdf`

**File:** `src/lib/exportPresentationPdf.js`

### Signature

```js
export function exportPresentationPdf(songs, bgImage)
```

`bgImage` is an `HTMLImageElement` (already loaded). Required — always provided by the modal.

### Background rendering

At the start of each page, before any text is drawn:

```js
doc.addImage(bgImage, 'PNG', 0, 0, PAGE_W, PAGE_H)
```

### Text colour updates

| Element | Old colour | New colour |
|---|---|---|
| Title | `(0, 0, 0)` black | `(35, 18, 6)` deep warm brown |
| Artist | `(100, 100, 100)` gray | `(90, 62, 42)` warm medium brown |
| Section labels | `(80, 80, 180)` blue | `(115, 22, 22)` deep crimson |
| Lyrics | `(0, 0, 0)` black | `(35, 18, 6)` deep warm brown |

---

## Changes to `Sidebar.jsx`

- Add `backgroundModalOpen` boolean state (default `false`)
- Add `pendingSongs` state to hold the songs array for the pending export
- `handleChoosePresentationPdf`: set `pendingSongs`, set `backgroundModalOpen(true)` (no longer calls `exportPresentationPdf` directly)
- Render `<ExportBackgroundModal>` controlled by `backgroundModalOpen`

---

## Asset placement

`Background.png` moves from the project root to `src/assets/Background.png` so Vite manages it as a hashed asset.

Import in `ExportBackgroundModal.jsx`:
```js
import defaultBgUrl from '../../assets/Background.png'
```

---

## Tests

### `exportPresentationPdf.test.js`

Update all existing calls to pass a minimal mock image:

```js
const mockBgImage = { src: '' } // jsPDF addImage mock accepts any object in jsdom
```

No new test cases needed — existing layout/font tests remain valid.

### `ExportBackgroundModal.test.jsx`

New file: `src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx`

- Smoke test: renders with `isOpen={true}`, shows Export and Cancel buttons
- Cancel test: clicking Cancel calls `onClose`
- Export disabled test: Export button is disabled when `bgImage` is null

---

## Files Touched

| Action | File |
|---|---|
| Move | `Background.png` → `src/assets/Background.png` |
| Modify | `src/lib/exportPresentationPdf.js` |
| Modify | `src/lib/__tests__/exportPresentationPdf.test.js` |
| Modify | `src/components/Sidebar/Sidebar.jsx` |
| Create | `src/components/Sidebar/ExportBackgroundModal.jsx` |
| Create | `src/components/Sidebar/__tests__/ExportBackgroundModal.test.jsx` |
