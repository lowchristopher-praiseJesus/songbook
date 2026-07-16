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

const mockIncreaseFontSize = vi.fn()
const mockDecreaseFontSize = vi.fn()
let fitToScreenMock = {
  fitFontSize: 18,
  fitColumns: 2,
  shadowRef: { current: null },
  canIncrease: true,
  canDecrease: true,
  increaseFontSize: mockIncreaseFontSize,
  decreaseFontSize: mockDecreaseFontSize,
}

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => fitToScreenMock),
}))

const mockRequestFullscreen = vi.fn()
const mockExitFullscreen = vi.fn()
let nativeFullscreenMock = { isSupported: true, requestFullscreen: mockRequestFullscreen, exitFullscreen: mockExitFullscreen }
let lastNativeFullscreenOnExit = null

vi.mock('../../../hooks/useNativeFullscreen', () => ({
  useNativeFullscreen: vi.fn(({ onExit }) => {
    lastNativeFullscreenOnExit = onExit
    return nativeFullscreenMock
  }),
}))

// Stub SongView to avoid deep rendering
vi.mock('../SongView', () => ({
  SongView: vi.fn(({ isFit }) => <div data-testid="song-view" data-is-fit={String(isFit)} />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

describe('MainContent maximize button', () => {
  beforeEach(() => {
    fitToScreenMock = {
      fitFontSize: 18,
      fitColumns: 2,
      shadowRef: { current: null },
      canIncrease: true,
      canDecrease: true,
      increaseFontSize: mockIncreaseFontSize,
      decreaseFontSize: mockDecreaseFontSize,
    }
    mockIncreaseFontSize.mockClear()
    mockDecreaseFontSize.mockClear()
    nativeFullscreenMock = { isSupported: true, requestFullscreen: mockRequestFullscreen, exitFullscreen: mockExitFullscreen }
    mockRequestFullscreen.mockClear()
    mockExitFullscreen.mockClear()
    lastNativeFullscreenOnExit = null
  })

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

  it('hides the draggable floating controls pill while fit mode is active', () => {
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
    expect(screen.queryByLabelText('Fit song to screen')).not.toBeInTheDocument()
  })

  it('shows an active font-size pill next to the exit button while maximized', () => {
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
    expect(screen.getByLabelText('Increase font size')).toBeInTheDocument()
    expect(screen.getByLabelText('Decrease font size')).toBeInTheDocument()
  })

  it('calls increaseFontSize/decreaseFontSize when the maximize-mode pill buttons are clicked', () => {
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
    fireEvent.click(screen.getByLabelText('Increase font size'))
    expect(mockIncreaseFontSize).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Decrease font size'))
    expect(mockDecreaseFontSize).toHaveBeenCalledTimes(1)
  })

  it('disables the increase button when canIncrease is false', () => {
    fitToScreenMock = { ...fitToScreenMock, canIncrease: false }
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
    expect(screen.getByLabelText('Increase font size')).toBeDisabled()
    expect(screen.getByLabelText('Decrease font size')).not.toBeDisabled()
  })

  it('disables the decrease button when canDecrease is false', () => {
    fitToScreenMock = { ...fitToScreenMock, canDecrease: false }
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
    expect(screen.getByLabelText('Decrease font size')).toBeDisabled()
    expect(screen.getByLabelText('Increase font size')).not.toBeDisabled()
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

  it('turns off annotate mode when exiting maximize via the exit button', () => {
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
    fireEvent.click(screen.getByLabelText('Annotate'))
    expect(useAnnotationStore.getState().annotateMode).toBe(true)

    fireEvent.click(screen.getByLabelText('Exit maximize'))
    expect(useAnnotationStore.getState().annotateMode).toBe(false)
  })

  it('requests native fullscreen when entering maximize mode', () => {
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
    expect(mockRequestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exits native fullscreen when the exit button is clicked', () => {
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
    expect(mockExitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exits maximize mode when native fullscreen is exited externally (e.g. Escape or browser control)', () => {
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

    act(() => { lastNativeFullscreenOnExit() })

    expect(screen.queryByLabelText('Exit maximize')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })

  it('sizes the maximize overlay using the dynamic viewport height unit', () => {
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
    const overlay = screen.getByTestId('maximize-overlay')
    expect(overlay.className).toMatch(/\bh-dvh\b/)
  })

  it('exits maximize mode and calls exitFullscreen when Escape key is pressed', () => {
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

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(mockExitFullscreen).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Exit maximize')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Fit song to screen')).toBeInTheDocument()
  })
})
