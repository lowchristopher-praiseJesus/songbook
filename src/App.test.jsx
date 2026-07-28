import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// This file exists to cover the one untested link in the maximizeMinFontSize
// chain: the JSX wiring in App.jsx that reads
// `displaySettings.settings.maximizeMinFontSize` (the REAL useDisplaySettings
// hook, backed by localStorage) and passes it into MainContent's
// `maximizeMinFontSize` prop. Every other link in the chain
// (useDisplaySettings <-> DisplayTab/SettingsPanel, MainContent ->
// useFitToScreen) already has coverage; this is the missing prop-threading
// link, deliberately using a non-default seeded value so a dropped/renamed
// prop can't hide behind MainContent's own default (18).

// --- Mock MainContent: capture the props App.jsx passes it, per the pattern
// used in MainContent.pagination.integration.test.jsx for mocking SongView.
let lastMainContentProps = null
vi.mock('./components/SongList/MainContent', () => ({
  MainContent: vi.fn((props) => {
    lastMainContentProps = props
    return <div data-testid="main-content" />
  }),
}))

// --- Mock useLibraryStore, following the same selector-invocation pattern
// used in SettingsPanel.test.jsx and MainContent.pagination.integration.test.jsx.
const mockLibraryState = {
  init: vi.fn(),
  addSongs: vi.fn(() => ({ newSongIds: [], collectionId: null })),
  setViewMode: vi.fn(),
  setExpandedCollectionId: vi.fn(),
  selectSong: vi.fn(),
  updateCollection: vi.fn(),
  collections: [],
  activeSong: null,
  index: [],
  setIsCreatingNewAlbum: vi.fn(),
  clearBroadcastFields: vi.fn(),
}
vi.mock('./store/libraryStore', () => ({
  useLibraryStore: Object.assign(
    vi.fn(selector => selector(mockLibraryState)),
    { getState: () => mockLibraryState }
  ),
}))

// --- Mock Sidebar: heavy component (imports export/share/UG-import modals,
// storage libs, etc.) with nothing to do with this test's assertion.
vi.mock('./components/Sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

beforeEach(() => {
  localStorage.clear()
  lastMainContentProps = null
})

describe('App maximizeMinFontSize wiring', () => {
  it('threads the real useDisplaySettings maximizeMinFontSize value into MainContent as its maximizeMinFontSize prop', () => {
    // Seed a non-default value (default is 18) so a dropped/renamed prop
    // can't hide behind MainContent's own fallback default.
    localStorage.setItem('songsheet_display_maximize_min_font_size', JSON.stringify(22))

    render(<App />)

    expect(lastMainContentProps).not.toBeNull()
    expect(lastMainContentProps.maximizeMinFontSize).toBe(22)
  })
})

describe('App sidebar toggle', () => {
  it('is visible at every breakpoint (no md:hidden)', () => {
    // Regression guard: the hamburger used to be md:hidden, which made the
    // sidebar unreachable on iPad / landscape phones once it was closed —
    // at ≥768px there is no other control that reopens it.
    render(<App />)
    const toggle = screen.getByLabelText('Toggle sidebar')
    expect(toggle.className).not.toContain('md:hidden')
  })
})
