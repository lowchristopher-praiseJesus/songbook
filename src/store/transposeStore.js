import { create } from 'zustand'

// Transpose/capo for the song currently on screen. Lives outside any component
// so it survives the view being remounted — Full Screen and the normal view are
// separate SongList instances, and Performance mode is opened from whichever is
// mounted. Only one song is tracked: selecting a different song starts it from
// its saved key (see useTranspose).
export const useTransposeStore = create(set => ({
  current: null, // { songId, defaultCapo, delta, capo }
  setCurrent: current => set({ current }),
}))

export function resetTransposeSession() {
  useTransposeStore.setState({ current: null })
}
