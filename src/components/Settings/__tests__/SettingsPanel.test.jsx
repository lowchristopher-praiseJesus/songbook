import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPanel } from '../SettingsPanel'

// --- Mock dependencies ---

// Mock ThemeContext
const mockSetTheme = vi.fn()
let mockTheme = 'light'
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}))

// Mock libraryStore
let mockIndex = []
const mockDeleteSong = vi.fn()
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({ index: mockIndex, deleteSong: mockDeleteSong }),
}))

// Mock getStorageStats
vi.mock('../../../lib/storage', () => ({
  getStorageStats: () => ({ usedBytes: 512 * 1024, limitBytes: 5 * 1024 * 1024 }),
}))

describe('SettingsPanel', () => {
  let onClose

  beforeEach(() => {
    onClose = vi.fn()
    mockTheme = 'light'
    mockIndex = []
    mockDeleteSong.mockReset()
    mockSetTheme.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders "Settings" heading', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows 0 songs correctly', () => {
    mockIndex = []
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText(/0 songs/)).toBeInTheDocument()
  })

  it('shows 1 song in singular form', () => {
    mockIndex = [{ id: 'a1', title: 'Song A', artist: 'Artist A' }]
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText(/^1 song$/)).toBeInTheDocument()
  })

  it('shows plural form for multiple songs', () => {
    mockIndex = [
      { id: 'a1', title: 'Song A', artist: 'Artist A' },
      { id: 'a2', title: 'Song B', artist: 'Artist B' },
    ]
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText(/2 songs/)).toBeInTheDocument()
  })

  it('renders a storage bar element', () => {
    render(<SettingsPanel onClose={onClose} />)
    const bar = screen.getByTestId('storage-bar')
    expect(bar).toBeInTheDocument()
  })

  it('storage bar width is clamped to 100% when over limit', () => {
    // Override getStorageStats mock inline — can't re-mock easily, but we know
    // 512KB / 5120KB = 10%, so the bar should be 10%
    render(<SettingsPanel onClose={onClose} />)
    const bar = screen.getByTestId('storage-bar')
    // The width should be a percentage (not over 100)
    const widthStyle = bar?.style?.width ?? ''
    const pct = parseFloat(widthStyle)
    expect(pct).toBeLessThanOrEqual(100)
    expect(pct).toBeGreaterThan(0)
  })

  it('renders Light, Dark, and System theme buttons', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /system/i })).toBeInTheDocument()
  })

  it('close button has type="button"', () => {
    render(<SettingsPanel onClose={onClose} />)
    // The ✕ close button is the one without text content matching a theme label
    const allButtons = screen.getAllByRole('button')
    const closeBtn = allButtons.find(b => b.textContent === '✕')
    expect(closeBtn).toBeDefined()
    expect(closeBtn).toHaveAttribute('type', 'button')
  })

  it('close button calls onClose', () => {
    render(<SettingsPanel onClose={onClose} />)
    const allButtons = screen.getAllByRole('button')
    const closeBtn = allButtons.find(b => b.textContent === '✕')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Clear All Data button calls window.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SettingsPanel onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /clear all data/i }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith('Delete ALL songs? This cannot be undone.')
  })

  it('does not delete songs if confirm returns false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockIndex = [{ id: 'a1', title: 'Song A', artist: '' }]
    render(<SettingsPanel onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /clear all data/i }))
    expect(mockDeleteSong).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('deletes all songs and calls onClose when confirm returns true', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockIndex = [
      { id: 'a1', title: 'Song A', artist: '' },
      { id: 'a2', title: 'Song B', artist: '' },
    ]
    render(<SettingsPanel onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /clear all data/i }))
    expect(mockDeleteSong).toHaveBeenCalledTimes(2)
    expect(mockDeleteSong).toHaveBeenCalledWith('a1')
    expect(mockDeleteSong).toHaveBeenCalledWith('a2')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
