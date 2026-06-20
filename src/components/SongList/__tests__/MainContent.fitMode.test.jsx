import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'

// Stub every store/hook dependency MainContent uses
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      activeSong: {
        id: 'song-1',
        meta: { title: 'Test', keyIndex: 0 },
        sections: [],
      },
      activeSongId: 'song-1',
      index: [],
      collections: [],
      selectSong: vi.fn(),
      editingSongId: null,
      setEditingSongId: vi.fn(),
      viewMode: 'all',
    })
  ),
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

// Stub SongView to avoid deep rendering
vi.mock('../SongView', () => ({
  SongView: vi.fn(({ isFit }) => <div data-testid="song-view" data-is-fit={String(isFit)} />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

describe('MainContent maximize button', () => {
  it('renders the maximize button when a song is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })

  it('maximize button is inactive initially', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    const btn = screen.getByLabelText('Fit song to screen')
    expect(btn.className).not.toMatch(/indigo/)
  })

  it('toggles isFit on click and passes it to SongView', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    const btn = screen.getByLabelText('Fit song to screen')
    fireEvent.click(btn)
    expect(screen.getByTestId('song-view').dataset.isFit).toBe('true')
  })

  it('hides the floating controls pill while fit mode is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    expect(screen.queryByLabelText('Increase font size')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decrease font size')).not.toBeInTheDocument()
  })

  it('shows an exit maximize button in the overlay while fit mode is active', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    expect(screen.getByLabelText('Exit maximize')).toBeInTheDocument()
  })

  it('exits maximize mode when the exit button is clicked', () => {
    render(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Fit song to screen'))
    fireEvent.click(screen.getByLabelText('Exit maximize'))
    expect(screen.queryByLabelText('Exit maximize')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })
})
