import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MainContent } from '../MainContent'
import { useAnnotationStore } from '../../../store/annotationStore'

// Stub every store/hook dependency MainContent uses
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      activeSong: {
        id: 'song-1',
        meta: { title: 'Test', keyIndex: 0, annotation: 'Start soft' },
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

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18, fitColumns: 2, shadowRef: { current: null },
    canIncrease: true, canDecrease: true, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
  })),
}))

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

import { useMaximizeSettingsStore } from '../../../store/maximizeSettingsStore'
import { useFitToScreen } from '../../../hooks/useFitToScreen'

function renderMaximized() {
  render(<MainContent onAddToast={vi.fn()} fontSize={16} onFontSizeChange={vi.fn()} lyricsOnly={false} onImportSuccess={vi.fn()} />)
  fireEvent.click(screen.getByLabelText('Fit song to screen'))
}

describe('MainContent maximize Song Note toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    useMaximizeSettingsStore.setState({ showSongNote: true })
    useAnnotationStore.setState({ baseline: null })
  })

  it('is on by default and turns the song note off and on', () => {
    renderMaximized()
    const btn = screen.getByLabelText('Hide song note')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(useMaximizeSettingsStore.getState().showSongNote).toBe(false)
    expect(screen.getByLabelText('Show song note')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByLabelText('Show song note'))
    expect(useMaximizeSettingsStore.getState().showSongNote).toBe(true)
  })

  it('passes the setting to useFitToScreen so the layout re-fits', () => {
    renderMaximized()
    fireEvent.click(screen.getByLabelText('Hide song note'))
    const lastArgs = useFitToScreen.mock.calls.at(-1)[0]
    expect(lastArgs.layoutKey).toBe(false)
  })

  it('is disabled while the song has a frozen annotation baseline', () => {
    renderMaximized()
    // Set after mount: MainContent's loadForSong effect resets the baseline from storage.
    act(() => {
      useAnnotationStore.setState({ baseline: { fontSize: 18, columns: 1, width: 100, height: 100, showSongNote: true } })
    })
    expect(screen.getByLabelText('Hide song note')).toBeDisabled()
  })
})
