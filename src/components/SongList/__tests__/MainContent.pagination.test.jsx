import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainContent } from '../MainContent'

const songs = {
  'song-1': { id: 'song-1', meta: { title: 'Song One', keyIndex: 0 }, sections: [] },
  'song-2': { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
  'song-3': { id: 'song-3', meta: { title: 'Song Three', keyIndex: 0 }, sections: [] },
}
let currentSongId = 'song-2'
const mockSelectSong = vi.fn((id) => { currentSongId = id })

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: vi.fn(selector =>
    selector({
      get activeSong() { return songs[currentSongId] },
      get activeSongId() { return currentSongId },
      index: [],
      collections: [],
      selectSong: (id) => mockSelectSong(id),
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
  buildNavOrder: vi.fn(() => [
    { id: 'song-1', title: 'Song One' },
    { id: 'song-2', title: 'Song Two' },
    { id: 'song-3', title: 'Song Three' },
  ]),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => ({ isScrolling: false, start: vi.fn(), stop: vi.fn() })),
}))

const fitStateBySong = {
  'song-1': {
    fitFontSize: 20, fitColumns: 3, paginated: true, totalColumns: 6, totalPages: 2,
    pageColWidth: 250, fitAvailableHeight: 600, shadowRef: { current: null },
    canIncrease: true, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
    settled: true, measuredSongId: 'song-1',
  },
  'song-2': {
    fitFontSize: 20, fitColumns: 3, paginated: true, totalColumns: 9, totalPages: 3,
    pageColWidth: 250, fitAvailableHeight: 600, shadowRef: { current: null },
    canIncrease: true, canDecrease: false, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
    settled: true, measuredSongId: 'song-2',
  },
  'song-3': {
    fitFontSize: 22, fitColumns: 2, paginated: false, totalColumns: null, totalPages: 1,
    pageColWidth: null, fitAvailableHeight: null, shadowRef: { current: null },
    canIncrease: true, canDecrease: true, increaseFontSize: vi.fn(), decreaseFontSize: vi.fn(),
    settled: true, measuredSongId: 'song-3',
  },
}

// Simulates useFitToScreen's own settled/unsettled reporting for 'song-1'
// specifically: a transitional first-pass measurement (settled: false), the
// self-corrected settled measurement that follows it (settled: true, per
// useFitToScreen's double-rAF correction), a later, genuine user-initiated
// re-measurement (also settled: true) representing e.g. a font-size change
// well after the song first settled, and — critically — a "stale" phase
// modeling the real cross-hook staleness window: useFitToScreen's internal
// useState can't synchronously track a songId prop change, so on the very
// first render right after a song-cross, the hook can still be reporting
// the PREVIOUS song's totalPages/settled, tagged with the PREVIOUS song's
// measuredSongId, even though MainContent's own activeSongId has already
// switched. MainContent must tell all of these apart via landOnLastPageRef
// + measuredSongId, not via settled alone.
let song1Phase = 'first' // 'first' | 'stale' | 'unsettled' | 'corrected' | 'laterChange'
const song1Base = fitStateBySong['song-1']
const song1Stale = {
  ...song1Base,
  totalColumns: fitStateBySong['song-2'].totalColumns,
  totalPages: fitStateBySong['song-2'].totalPages,
  settled: true,
  measuredSongId: 'song-2', // mismatched: hook hasn't caught up to song-1 yet
}
const song1Unsettled = { ...song1Base, totalColumns: 6, totalPages: 2, settled: false }
const song1Corrected = { ...song1Base, totalColumns: 12, totalPages: 4, settled: true }
const song1LaterChange = { ...song1Base, fitFontSize: 24, totalColumns: 15, totalPages: 5, settled: true }

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(({ songId }) => {
    if (songId === 'song-1') {
      if (song1Phase === 'stale') return song1Stale
      if (song1Phase === 'unsettled') return song1Unsettled
      if (song1Phase === 'corrected') return song1Corrected
      if (song1Phase === 'laterChange') return song1LaterChange
      return song1Base
    }
    return fitStateBySong[songId] ?? fitStateBySong['song-2']
  }),
}))

vi.mock('../SongView', () => ({
  SongView: vi.fn(() => <div data-testid="song-view" />),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

function renderMaximized() {
  const result = render(
    <MainContent
      onAddToast={vi.fn()}
      fontSize={16}
      onFontSizeChange={vi.fn()}
      lyricsOnly={false}
      onImportSuccess={vi.fn()}
    />
  )
  fireEvent.click(screen.getByLabelText('Fit song to screen'))
  return result
}

describe('MainContent maximize-mode pagination', () => {
  beforeEach(() => {
    currentSongId = 'song-2'
    mockSelectSong.mockClear()
    song1Phase = 'first'
  })

  it('shows a page indicator and pages forward before crossing to the next song', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 3 of 3')
    expect(mockSelectSong).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-3')
  })

  it('paging backward from page 1 crosses to the previous song and lands on its last page', () => {
    renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    // song-1 has totalPages: 2 -> should land on page 2 of 2
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 2')
  })

  it('does not show a page indicator for a non-paginated song', () => {
    currentSongId = 'song-3'
    renderMaximized()
    expect(screen.queryByTestId('page-indicator')).not.toBeInTheDocument()
  })

  it('keeps landing on the last page once useFitToScreen settles its self-correction for the same song', () => {
    const { rerender } = renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Cross backward into song-1 while it's still reporting its
    // transitional, unsettled first-pass measurement (totalPages: 2,
    // settled: false) — the reset effect must not act on this yet.
    song1Phase = 'unsettled'
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')

    // Simulate useFitToScreen's own double-rAF self-correction completing:
    // totalPages changes for the *same* song and settled flips to true.
    song1Phase = 'corrected'
    rerender(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )

    // Must land on the corrected last page, 4 of 4 — not the unsettled
    // measurement's last page, and not reset to page 1.
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 4 of 4')
  })

  it('does not re-snap to the last page for a genuine same-song re-measurement once already settled', () => {
    const { rerender } = renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Cross backward into song-1 with the hook already settled (no
    // transitional first pass in this scenario) — lands on the last page,
    // 4 of 4, and landOnLastPageRef is cleared immediately since it acted.
    song1Phase = 'corrected'
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 4 of 4')

    // Now simulate a genuine, later user action on the *same* song (e.g.
    // clicking font-size +/-), which also changes fitFontSize/totalPages
    // and re-fires the reset effect while settled stays true throughout.
    // Because landOnLastPageRef was already cleared above, this must
    // behave like a normal reset (page 1 of 5) — NOT re-land on the new
    // last page (page 5 of 5). This is the exact scenario round 1's fix
    // broke and round 2's timing-based auto-clear failed to actually fix.
    song1Phase = 'laterChange'
    rerender(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )

    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 5')
  })

  it('ignores a stale cross-hook render where activeSongId has switched but useFitToScreen still reports the previous song', () => {
    const { rerender } = renderMaximized()
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Cross backward into song-1. Model the real cross-hook staleness
    // window found by the reviewer with an unmocked hook: right after the
    // cross, useFitToScreen's own internal state (a separate useState) can
    // still be reporting song-2's totalPages/settled — tagged with song-2's
    // measuredSongId — even though activeSongId has already switched to
    // song-1. If the reset effect only gated on `settled` (round 3's fix),
    // this stale render would wrongly compute the "last page" off song-2's
    // totalPages and clear landOnLastPageRef right then, so the real
    // settled data for song-1 (arriving moments later) would find the ref
    // already gone and fall through to a normal reset instead of landing
    // on song-1's actual last page.
    song1Phase = 'stale'
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')
    // Must not have consumed the ref using song-2's stale totalPages (3) —
    // the indicator must not reflect that wrong computation.
    expect(screen.getByTestId('page-indicator')).not.toHaveTextContent('Page 3 of 3')

    // The hook catches up: its real (still transitional) unsettled pass for
    // song-1 lands, correctly tagged with song-1's own measuredSongId.
    song1Phase = 'unsettled'
    rerender(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )

    // And then its settled, corrected pass for song-1 lands.
    song1Phase = 'corrected'
    rerender(
      <MainContent
        onAddToast={vi.fn()}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        lyricsOnly={false}
        onImportSuccess={vi.fn()}
      />
    )

    // Because the stale render never consumed the ref, it's still armed for
    // song-1 when the real settled data arrives, and lands correctly on
    // song-1's actual last page, 4 of 4 — not a normal reset to page 1.
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 4 of 4')
  })
})
