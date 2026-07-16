import { useLayoutEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MainContent } from '../MainContent'

// This file deliberately does NOT mock '../../../hooks/useFitToScreen' — it's
// the one thing this suite exists to exercise for real. Everything else
// MainContent depends on is mocked the same way MainContent.pagination.test.jsx
// mocks it, so this is a *permanent, automated* version of the throwaway
// unmocked-hook/real-rAF reproduction used to find and verify the round 2-4
// fixes for the backward-cross pagination bug (see task-5-report.md): a
// single test proving MainContent + the REAL useFitToScreen still page
// correctly together, so a future refactor that changes the hook's
// settled/measuredSongId emission order/contract will fail this test even if
// useFitToScreen.test.js's own unit tests (which test the hook in isolation)
// somehow still pass.

const songs = {
  'song-1': { id: 'song-1', meta: { title: 'Song One', keyIndex: 0 }, sections: [] },
  'song-2': { id: 'song-2', meta: { title: 'Song Two', keyIndex: 0 }, sections: [] },
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
  ]),
}))

vi.mock('../../../hooks/useScrollSettings', () => ({
  useScrollSettings: vi.fn(() => ({ targetDuration: 90, setTargetDuration: vi.fn() })),
}))

vi.mock('../../../hooks/useAutoScroll', () => ({
  useAutoScroll: vi.fn(() => ({ isScrolling: false, start: vi.fn(), stop: vi.fn() })),
}))

vi.mock('../PerformanceMode/PerformanceModal', () => ({
  PerformanceModal: vi.fn(() => null),
}))

// --- DOM-measurement fakes, matching useFitToScreen.test.js's exact pattern ---
// (plain duck-typed objects satisfying the getBoundingClientRect/clientHeight/
// clientWidth/style interface useFitToScreen reads — not real DOM nodes,
// since jsdom doesn't do real layout).

function makeContainerObj(clientHeight = 400, clientWidth = 900) {
  return { clientHeight, clientWidth, scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) }
}

function makeBodyObj(offsetTop = 80) {
  return { getBoundingClientRect: () => ({ top: offsetTop }) }
}

// A shadow that never fits a single page (height always 9999, forcing the
// MIN_FONT/pagination fallback), and reports a width implying `totalColumns`
// columns once switched into pagination-measurement mode — identical to
// useFitToScreen.test.js's makePaginatingShadowEl.
function makePaginatingShadowObj({ totalColumns = 7 } = {}) {
  const el = {
    style: {
      columnCount: 1,
      columnWidth: '', columnGap: '', columnFill: '', width: '', height: '',
      setProperty: vi.fn(),
    },
    getBoundingClientRect: () => {
      if (typeof el.style.columnCount === 'number') return { height: 9999, width: 0 }
      const colWidth = parseFloat(el.style.columnWidth) || 0
      return { height: 9999, width: totalColumns * (colWidth + 32) }
    },
  }
  return el
}

// Per-song totalColumns, chosen to produce different totalPages per song
// (ceil(totalColumns / MAX_COLS=3)) — this difference is exactly what
// exposes the cross-hook staleness bug if MainContent's guard regresses:
// song-2 -> totalPages 3, song-1 -> totalPages 2.
const shadowForSong = {
  'song-1': () => makePaginatingShadowObj({ totalColumns: 6 }),
  'song-2': () => makePaginatingShadowObj({ totalColumns: 9 }),
}

// A real container/body pair, shared across songs (viewport geometry
// doesn't vary by song — only the shadow's reported column count does).
const sharedContainerObj = makeContainerObj()
const sharedBodyObj = makeBodyObj()

// Stand-in for SongView: MainContent threads containerRef/bodyRef/shadowRef
// down to SongView (per Task 4), and in the real app SongBody attaches
// shadowRef to an actual shadow-measurement DOM node it renders. Since
// SongView itself is mocked away here (we only want the REAL useFitToScreen,
// not the full song-rendering tree), this mock plays that role: on every
// render it imperatively populates the refs with the DOM-measurement fakes
// above, keyed to the current song. It does this in a useLayoutEffect so it
// runs in MainContent's own commit — React fires a child's layout effects
// before its parent's in the same commit, so this always populates the refs
// before useFitToScreen's own layout effect (registered in the parent,
// MainContent) reads them.
vi.mock('../SongView', () => ({
  SongView: vi.fn(({ song, containerRef, bodyRef, shadowRef }) => {
    useLayoutEffect(() => {
      if (containerRef) containerRef.current = sharedContainerObj
      if (bodyRef) bodyRef.current = sharedBodyObj
      if (shadowRef && song?.id) shadowRef.current = shadowForSong[song.id]()
    }, [song?.id, containerRef, bodyRef, shadowRef])
    return <div data-testid="song-view" />
  }),
}))

async function flushRaf() {
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => requestAnimationFrame(resolve))
  })
}

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

beforeEach(() => {
  currentSongId = 'song-2'
  mockSelectSong.mockClear()
  vi.stubGlobal('ResizeObserver', vi.fn(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
  })))
})

afterEach(() => vi.unstubAllGlobals())

describe('MainContent + real useFitToScreen integration', () => {
  it('pages backward across songs and lands on the crossed-into song\'s real last page, with only DOM measurement faked', async () => {
    renderMaximized()
    await flushRaf() // let song-2's own unsettled -> settled pass land
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3')

    // Cross backward into song-1 (currentPage is 0, so goPrev crosses songs
    // immediately rather than paging in place).
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(mockSelectSong).toHaveBeenCalledWith('song-1')

    // The REAL useFitToScreen hook now needs its own double-rAF settling
    // window for song-1 before MainContent's reset effect will act.
    await flushRaf()

    // Must land on song-1's actual last page (totalColumns:6 -> totalPages:2
    // -> displayed "Page 2 of 2"), not page 1, and not song-2's page count
    // (which would show "Page 3 of 3" if the cross-hook staleness bug this
    // integration test guards against ever regressed).
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('Page 2 of 2')
  })
})
