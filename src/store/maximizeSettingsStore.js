import { create } from 'zustand'

// Viewer preferences for Maximize (full-screen) mode that more than one
// component needs to read: the overlay toolbar toggles them, the title block
// renders from them, useFitToScreen re-measures when they change layout, and
// the annotation baseline snapshots them. A shared store (rather than
// useLocalStorage, whose instances don't sync) keeps them all in step.

const SONG_NOTE_KEY = 'songsheet_maximize_song_note_visible'

function readBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) === true : fallback
  } catch {
    return fallback
  }
}

export const useMaximizeSettingsStore = create((set, get) => ({
  // Show the song-level "Song Note" (meta.annotation) under the title. Default on.
  showSongNote: readBool(SONG_NOTE_KEY, true),

  setShowSongNote(value) {
    set({ showSongNote: !!value })
    try {
      localStorage.setItem(SONG_NOTE_KEY, JSON.stringify(!!value))
    } catch (e) {
      console.warn('maximizeSettingsStore write failed:', e)
    }
  },

  toggleShowSongNote() {
    get().setShowSongNote(!get().showSongNote)
  },
}))
