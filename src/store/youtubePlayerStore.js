import { create } from 'zustand'

// Global so the player (rendered once, at the MainContent level) survives
// remounts of the song-view subtree — e.g. entering Maximize or Performance
// mode, which swap out the component tree that used to own this state
// (SongHeader), killing the embedded video's iframe along with it.
export const useYoutubePlayerStore = create((set) => ({
  openForSongId: null,
  minimized: false,

  open(songId) { set({ openForSongId: songId, minimized: false }) },
  minimize() { set({ minimized: true }) },
  expand() { set({ minimized: false }) },
  close() { set({ openForSongId: null, minimized: false }) },
}))
