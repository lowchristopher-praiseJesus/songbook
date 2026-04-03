import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryStore } from '../libraryStore'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    index: [],
    collections: [],
    activeSongId: null,
    activeSong: null,
    editingSongId: null,
    viewMode: 'collections',
  })
})

describe('viewMode', () => {
  it('defaults to "collections"', () => {
    expect(useLibraryStore.getState().viewMode).toBe('collections')
  })

  it('setViewMode switches to allSongs', () => {
    useLibraryStore.getState().setViewMode('allSongs')
    expect(useLibraryStore.getState().viewMode).toBe('allSongs')
  })

  it('setViewMode persists to localStorage', () => {
    useLibraryStore.getState().setViewMode('allSongs')
    expect(localStorage.getItem('songsheet_view_mode')).toBe('allSongs')
  })

  it('init() restores viewMode from localStorage', () => {
    localStorage.setItem('songsheet_view_mode', 'allSongs')
    useLibraryStore.getState().init()
    expect(useLibraryStore.getState().viewMode).toBe('allSongs')
  })

  it('init() defaults to collections when localStorage is empty', () => {
    useLibraryStore.getState().init()
    expect(useLibraryStore.getState().viewMode).toBe('collections')
  })
})
