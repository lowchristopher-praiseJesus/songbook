import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

// Minimal mocks — only what Sidebar needs to render the control
const mockSetViewMode = vi.fn()
let mockViewMode = 'collections'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      index: [],
      collections: [],
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleExportMode: vi.fn(),
      viewMode: mockViewMode,
      setViewMode: mockSetViewMode,
      createCollection: vi.fn(),
    }),
}))

vi.mock('../../../hooks/useFileImport', () => ({
  useFileImport: () => ({ importFiles: vi.fn() }),
}))

vi.mock('../../UGImport/UGSearchModal', () => ({
  UGSearchModal: () => null,
}))

vi.mock('../../Share/ShareModal', () => ({
  ShareModal: () => null,
}))

vi.mock('../ExportBackgroundModal', () => ({
  ExportBackgroundModal: () => null,
}))

vi.mock('../../../lib/storage', () => ({
  loadSong: vi.fn(() => null),
}))

vi.mock('../AllSongsList', () => ({
  AllSongsList: () => <ul data-testid="all-songs-list" />,
}))

const defaultProps = {
  isOpen: true,
  onAddToast: vi.fn(),
  onSongSelect: vi.fn(),
  onClose: vi.fn(),
  onImportSuccess: vi.fn(),
}

describe('Sidebar view toggle', () => {
  beforeEach(() => {
    mockViewMode = 'collections'
    mockSetViewMode.mockReset()
  })

  it('renders Collections and All Songs buttons', () => {
    render(<Sidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All Songs' })).toBeInTheDocument()
  })

  it('calls setViewMode("allSongs") when All Songs is clicked', () => {
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'All Songs' }))
    expect(mockSetViewMode).toHaveBeenCalledWith('allSongs')
  })

  it('calls setViewMode("collections") when Collections is clicked', () => {
    mockViewMode = 'allSongs'
    render(<Sidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }))
    expect(mockSetViewMode).toHaveBeenCalledWith('collections')
  })

  it('hides the view toggle while a search query is active', () => {
    render(<Sidebar {...defaultProps} />)
    const input = screen.getByPlaceholderText('Search songs...')
    expect(screen.getByRole('button', { name: 'Collections' })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'grace' } })
    expect(screen.queryByRole('button', { name: 'Collections' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All Songs' })).not.toBeInTheDocument()
  })
})
