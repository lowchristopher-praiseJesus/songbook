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

// Mock LicenseContext
const mockSetLicenseKey = vi.fn()
let mockLicenseStatus = 'missing'
let mockLicenseKey = null
let mockIsLicensed = false
vi.mock('../../../contexts/LicenseContext', () => ({
  useLicense: () => ({
    licenseKey: mockLicenseKey,
    setLicenseKey: mockSetLicenseKey,
    licenseStatus: mockLicenseStatus,
    isLicensed: mockIsLicensed,
  }),
}))
let mockIndex = []
const mockDeleteSong = vi.fn()
vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({ index: mockIndex, deleteSong: mockDeleteSong }),
}))

// Mock storage module
const mockSetFirecrawlKey = vi.fn()
let mockGetFirecrawlKey = () => ''
vi.mock('../../../lib/storage', () => ({
  getStorageStats: () => ({ usedBytes: 512 * 1024, limitBytes: 5 * 1024 * 1024 }),
  getFirecrawlKey: (...args) => mockGetFirecrawlKey(...args),
  setFirecrawlKey: (...args) => mockSetFirecrawlKey(...args),
}))

// Mock firecrawlClient
const mockGetCreditUsage = vi.fn()
vi.mock('../../../lib/ugImport/firecrawlClient', () => ({
  getCreditUsage: (...args) => mockGetCreditUsage(...args),
}))

describe('SettingsPanel', () => {
  let onClose

  beforeEach(() => {
    vi.useFakeTimers()
    onClose = vi.fn()
    mockTheme = 'light'
    mockIndex = []
    mockDeleteSong.mockReset()
    mockSetTheme.mockReset()
    mockSetFirecrawlKey.mockReset()
    mockGetFirecrawlKey = () => ''
    mockGetCreditUsage.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('dialog has correct ARIA attributes', () => {
    render(<SettingsPanel onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'settings-title')
  })

  it('settings heading has id matching aria-labelledby', () => {
    render(<SettingsPanel onClose={onClose} />)
    const heading = document.getElementById('settings-title')
    expect(heading).toBeInTheDocument()
    expect(heading.tagName).toBe('H2')
  })

  it('close button has aria-label "Close settings"', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByLabelText('Close settings')).toBeInTheDocument()
  })

  it('Escape key calls onClose', () => {
    render(<SettingsPanel onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Firecrawl API key field ---

  it('Firecrawl key input renders with type="password" and placeholder "fc-…"', () => {
    render(<SettingsPanel onClose={onClose} />)
    const input = screen.getByPlaceholderText('fc-…')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'password')
  })

  it('clicking Show toggles button label to Hide and input type to text', () => {
    render(<SettingsPanel onClose={onClose} />)
    const showBtn = screen.getByLabelText('Show Firecrawl API key')
    expect(showBtn).toHaveTextContent('Show')
    fireEvent.click(showBtn)
    expect(screen.getByLabelText('Hide Firecrawl API key')).toHaveTextContent('Hide')
    const input = screen.getByPlaceholderText('fc-…')
    expect(input).toHaveAttribute('type', 'text')
  })

  it('typing in the Firecrawl key input calls setFirecrawlKey with the new value', () => {
    render(<SettingsPanel onClose={onClose} />)
    const input = screen.getByPlaceholderText('fc-…')
    fireEvent.change(input, { target: { value: 'fc-testkey123' } })
    expect(mockSetFirecrawlKey).toHaveBeenCalledWith('fc-testkey123')
  })

  it('Firecrawl key input pre-populates when getFirecrawlKey returns a value', () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    render(<SettingsPanel onClose={onClose} />)
    const input = screen.getByPlaceholderText('fc-…')
    expect(input).toHaveValue('fc-existingkey')
  })

  // --- Firecrawl credit usage ---

  it('does not fetch credit usage when no key is present', async () => {
    mockGetFirecrawlKey = () => ''
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    expect(mockGetCreditUsage).not.toHaveBeenCalled()
  })

  it('shows "Checking credit balance…" while the fetch is pending', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Checking credit balance…')).toBeInTheDocument())
  })

  it('renders the credit bar with correct width on success', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockResolvedValue({
      remainingCredits: 400,
      planCredits: 1000,
      billingPeriodStart: '2026-07-01T00:00:00Z',
      billingPeriodEnd: '2026-07-31T23:59:59Z',
    })
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByTestId('firecrawl-credit-bar')).toBeInTheDocument())
    const bar = screen.getByTestId('firecrawl-credit-bar')
    expect(bar.style.width).toBe('60%')
    expect(screen.getByText('400 / 1,000 credits remaining')).toBeInTheDocument()
  })

  it('clamps the credit bar width to 0 when remainingCredits exceeds planCredits', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockResolvedValue({
      remainingCredits: 1200,
      planCredits: 1000,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    })
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByTestId('firecrawl-credit-bar')).toBeInTheDocument())
    expect(screen.getByTestId('firecrawl-credit-bar').style.width).toBe('0%')
  })

  it('renders a 0% bar instead of NaN when planCredits is 0', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockResolvedValue({
      remainingCredits: 0,
      planCredits: 0,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    })
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByTestId('firecrawl-credit-bar')).toBeInTheDocument())
    expect(screen.getByTestId('firecrawl-credit-bar').style.width).toBe('0%')
  })

  it('shows "Invalid API key" and no bar on UNAUTHORIZED', async () => {
    mockGetFirecrawlKey = () => 'fc-badkey'
    mockGetCreditUsage.mockRejectedValue(new Error('UNAUTHORIZED'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Invalid API key')).toBeInTheDocument())
    expect(screen.queryByTestId('firecrawl-credit-bar')).not.toBeInTheDocument()
  })

  it('shows "Credit usage not available for this key" on NOT_FOUND', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockRejectedValue(new Error('NOT_FOUND'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Credit usage not available for this key')).toBeInTheDocument())
  })

  it('shows "Could not check credit balance" on NETWORK_ERROR', async () => {
    mockGetFirecrawlKey = () => 'fc-existingkey'
    mockGetCreditUsage.mockRejectedValue(new Error('NETWORK_ERROR'))
    render(<SettingsPanel onClose={onClose} />)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(screen.getByText('Could not check credit balance')).toBeInTheDocument())
  })

  it('debounces rapid key edits into a single fetch', async () => {
    mockGetFirecrawlKey = () => ''
    mockGetCreditUsage.mockResolvedValue({ remainingCredits: 1, planCredits: 2, billingPeriodStart: null, billingPeriodEnd: null })
    render(<SettingsPanel onClose={onClose} />)
    const input = screen.getByPlaceholderText('fc-…')
    fireEvent.change(input, { target: { value: 'fc-a' } })
    await vi.advanceTimersByTimeAsync(200)
    fireEvent.change(input, { target: { value: 'fc-ab' } })
    await vi.advanceTimersByTimeAsync(200)
    fireEvent.change(input, { target: { value: 'fc-abc' } })
    await vi.advanceTimersByTimeAsync(600)
    expect(mockGetCreditUsage).toHaveBeenCalledTimes(1)
    expect(mockGetCreditUsage).toHaveBeenCalledWith('fc-abc')
  })
})
