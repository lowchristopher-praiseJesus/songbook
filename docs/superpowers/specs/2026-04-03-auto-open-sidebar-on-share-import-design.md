---
title: Auto-open sidebar after share-link import
date: 2026-04-03
status: approved
---

## Summary

When a user imports songs via a shared link, automatically open the sidebar on all screen sizes after the import completes, so they can immediately see the newly imported songs.

## Change

Single addition to `handleShareImport()` in `src/App.jsx`:

```js
function handleShareImport() {
  if (shareSongs) {
    addSongs(shareSongs, 'Shared Songs')
    addToast(`...`, 'success')
    setSidebarOpen(true)   // ← open sidebar on all screen sizes
  }
  setShareSongs(null)
  clearShareParam()
}
```

## Behaviour

- Sidebar opens on **all screen sizes** (mobile and desktop) after the user clicks "Import All".
- If the sidebar was already open (desktop default), `setSidebarOpen(true)` is a no-op.
- Cancel path (`handleShareCancel`) is unchanged — no sidebar action.

## Out of scope

- No animation changes.
- No change to the existing `onImportSuccess` prop pattern used by drag-and-drop imports.
