import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { useYoutubePlayerStore } from '../../../store/youtubePlayerStore'

// Store mutations happen outside any React event handler in these tests, so
// React won't know to flush the resulting re-render until told to. The
// zustand subscription notification lands in a microtask, so the act() call
// needs to be async to flush it cleanly.
async function openPlayer(songId) {
  await act(async () => { useYoutubePlayerStore.getState().open(songId) })
}
async function minimizePlayer() {
  await act(async () => { useYoutubePlayerStore.getState().minimize() })
}
async function expandPlayer() {
  await act(async () => { useYoutubePlayerStore.getState().expand() })
}

const mockSetSongYoutubeVideo = vi.fn()
const song1 = { id: 'song-1', meta: { title: 'Test One', artist: 'Someone', keyIndex: 0, youtubeVideoId: 'abc12345678' }, sections: [] }
const song2 = { id: 'song-2', meta: { title: 'Test Two', artist: 'Someone Else', keyIndex: 0 }, sections: [] }

// A plain mutable object (not real zustand) so individual tests can swap
// which song is "active" and re-render to observe MainContent react to it.
let libraryState = {
  activeSong: song1,
  activeSongId: 'song-1',
  index: [],
  collections: [],
  selectSong: vi.fn(),
  setSongYoutubeVideo: mockSetSongYoutubeVideo,
  editingSongId: null,
  setEditingSongId: vi.fn(),
  viewMode: 'all',
}

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector => selector(libraryState)),
}))

vi.mock('../../../hooks/useDropZone', () => ({
  useDropZone: vi.fn(() => ({ isDragging: false, onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() })),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: vi.fn(() => ({ importFiles: vi.fn() })),
}))

vi.mock('../../../hooks/useSwipeNavigation', () => ({
  useSwipeNavigation: vi.fn(() => ({ onTouchStart: vi.fn(), onTouchEnd: vi.fn() })),
}))

vi.mock('../../../lib/collectionUtils', () => ({
  buildNavOrder: vi.fn(() => []),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => ({ isScrolling: false, start: vi.fn(), stop: vi.fn() })),
}))

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18,
    fitColumns: 2,
    shadowRef: { current: null },
    canIncrease: true,
    canDecrease: true,
    increaseFontSize: vi.fn(),
    decreaseFontSize: vi.fn(),
  })),
}))

// Stub SongView (deep chord-chart rendering is irrelevant here) but keep
// YoutubeSearchModal real — that's the component under test: does its iframe
// survive MainContent swapping SongView instances for Maximize mode?
vi.mock('../SongView', () => ({
  SongView: vi.fn(({ isFit }) => <div data-testid="song-view" data-is-fit={String(isFit)} />),
}))

vi.mock('../../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => <div data-testid="performance-modal" />),
}))

function renderMainContent() {
  return render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
}

beforeEach(() => {
  libraryState = { ...libraryState, activeSong: song1, activeSongId: 'song-1' }
  mockSetSongYoutubeVideo.mockClear()
  useYoutubePlayerStore.setState({ openForSongId: null, minimized: false })
})

afterEach(() => {
  useYoutubePlayerStore.setState({ openForSongId: null, minimized: false })
})

describe('MainContent YouTube player persistence', () => {
  it('keeps the player mounted across entering Maximize mode', async () => {
    renderMainContent()
    await openPlayer('song-1')
    expect(screen.getByTitle('YouTube video player')).toBeInTheDocument()

    // This used to unmount SongHeader (and the iframe living inside it) —
    // the actual bug: maximizing killed the playing video immediately.
    fireEvent.click(screen.getByLabelText('Fit song to screen'))

    expect(screen.getByTitle('YouTube video player')).toBeInTheDocument()
    expect(screen.getByTestId('song-view').dataset.isFit).toBe('true')
  })

  it('does not render the player when nothing has opened it for the active song', () => {
    renderMainContent()
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument()
  })

  it('closes the player when the active song changes', async () => {
    const { rerender } = renderMainContent()
    await openPlayer('song-1')
    expect(useYoutubePlayerStore.getState().openForSongId).toBe('song-1')

    libraryState = { ...libraryState, activeSong: song2, activeSongId: 'song-2' }
    await act(async () => {
      rerender(
        <MainContent
          onAddToast={vi.fn()}
          fontSize={16}
          onFontSizeChange={vi.fn()}
          lyricsOnly={false}
          onImportSuccess={vi.fn()}
        />
      )
    })

    expect(useYoutubePlayerStore.getState().openForSongId).toBeNull()
    expect(screen.queryByTitle('YouTube video player')).not.toBeInTheDocument()
  })

  it('reserves bottom padding via --yt-min-bar-h only while minimized and open', async () => {
    renderMainContent()
    expect(document.documentElement.style.getPropertyValue('--yt-min-bar-h')).toBe('0px')

    await openPlayer('song-1')
    await minimizePlayer()
    expect(document.documentElement.style.getPropertyValue('--yt-min-bar-h')).toBe('3.5rem')

    await expandPlayer()
    expect(document.documentElement.style.getPropertyValue('--yt-min-bar-h')).toBe('0px')
  })

  it('opens straight to the active song\'s saved video', async () => {
    renderMainContent()
    await openPlayer('song-1')
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/abc12345678'
    )
  })
})
