import { describe, it, expect, beforeEach, vi } from 'vitest'

const KEY = 'songsheet_maximize_song_note_visible'

async function freshStore() {
  vi.resetModules()
  const mod = await import('../maximizeSettingsStore')
  return mod.useMaximizeSettingsStore
}

describe('maximizeSettingsStore', () => {
  beforeEach(() => localStorage.clear())

  it('shows the song note by default', async () => {
    const store = await freshStore()
    expect(store.getState().showSongNote).toBe(true)
  })

  it('reads a saved "off" preference', async () => {
    localStorage.setItem(KEY, 'false')
    const store = await freshStore()
    expect(store.getState().showSongNote).toBe(false)
  })

  it('toggles and persists the preference', async () => {
    const store = await freshStore()
    store.getState().toggleShowSongNote()
    expect(store.getState().showSongNote).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('false')
    store.getState().toggleShowSongNote()
    expect(store.getState().showSongNote).toBe(true)
    expect(localStorage.getItem(KEY)).toBe('true')
  })
})
