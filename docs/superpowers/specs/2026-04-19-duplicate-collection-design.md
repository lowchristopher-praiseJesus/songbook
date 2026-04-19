# Duplicate Collection — Design Spec

**Date:** 2026-04-19

## Overview

Allow users to duplicate an existing collection into a new collection with a user-chosen name. The duplicate shares the same song references (IDs) as the source; songs are not copied. From that point the two collections are independently managed.

---

## Data Model

No changes to the existing model. A duplicate is a new `{ id, name, createdAt, songIds }` record whose `songIds` array is a shallow copy of the source collection's. Multiple collections sharing the same song IDs is already supported by the data model.

---

## Store (`src/store/libraryStore.js`)

### New action: `duplicateCollection(sourceId, name)`

- Finds the source collection by ID; no-op if not found
- Creates `{ id: uuidv4(), name: name.trim(), createdAt: new Date().toISOString(), songIds: [...source.songIds] }`
- Inserts the new collection **immediately after** the source collection in the `collections` array (splice at `sourceIndex + 1`), saves to localStorage
- No-op if `name.trim()` is empty

---

## UI Components

### `src/components/Sidebar/CollectionGroup.jsx`

Add an `onDuplicate` prop (callback receiving `collectionId`, default `() => {}`).

Add a ⧉ button in the collection header action area, positioned between the `+` (add songs) and ✏️ (rename) buttons:

```jsx
<button
  type="button"
  title={`Duplicate ${group.name}`}
  onClick={e => { e.stopPropagation(); onDuplicate(group.id) }}
  aria-label={`Duplicate collection ${group.name}`}
  className="ml-1 p-1 rounded shrink-0
    [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100
    focus:opacity-100 transition-opacity
    hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
>
  ⧉
</button>
```

Visibility rules (same as existing `+` and 🗑 buttons):
- Hidden when `isExportMode` is true
- Hidden when `isSpecial` (`group.id === '__uncategorized__'`)
- Hover-reveal on pointer devices; always visible on touch

### `src/components/Sidebar/Sidebar.jsx`

Add state:
- `duplicatingId: string | null` — the source collection ID currently being duplicated
- `duplicateDraft: string` — the current value of the name input

When `onDuplicate(id)` is called:
- Set `duplicatingId = id`
- Set `duplicateDraft = "Copy of " + group.name`

In the collections list, render the inline name input directly **after** the `CollectionGroup` whose `group.id === duplicatingId`. Reuse the same inline input styling as the existing "New Collection" input:

- Pre-filled with `duplicateDraft`
- Placeholder: `"Collection name…"`
- Hint text below: `"Enter to confirm · Esc to cancel"`
- On Enter or blur with non-empty value: call `duplicateCollection(duplicatingId, duplicateDraft)`, clear `duplicatingId` and `duplicateDraft`
- On Escape or blur with empty value: cancel, clear state

Pass `onDuplicate` to each `CollectionGroup` rendered in the sidebar.

---

## Testing

### Store (`src/store/__tests__/libraryStore.test.js`)

- `duplicateCollection`: copies `songIds` from source into new collection
- `duplicateCollection`: inserts new collection immediately after source in `collections` array and persists to localStorage
- `duplicateCollection`: no-op when `sourceId` does not exist
- `duplicateCollection`: no-op when `name` is blank or whitespace-only

### `CollectionGroup` (`src/components/Sidebar/__tests__/CollectionGroup.test.jsx`)

- ⧉ button calls `onDuplicate` with correct collection ID
- ⧉ button is not rendered in export mode
- ⧉ button is not rendered for `__uncategorized__` group

### `Sidebar` (integration)

- Inline name input appears after the correct `CollectionGroup` when `onDuplicate` fires
- Enter confirms and calls `duplicateCollection` with correct sourceId and name
- Escape cancels without calling `duplicateCollection`
- Input is pre-filled with `"Copy of {original name}"`

---

## Out of Scope

- Duplicating songs themselves (copies share the same song records)
- Duplicating the `__uncategorized__` virtual group
- Batch-duplicating multiple collections at once
