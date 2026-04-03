import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportBackgroundModal } from '../ExportBackgroundModal'
import { exportPresentationPdf } from '../../../lib/exportPresentationPdf'

vi.mock('../../../assets/Background.png', () => ({ default: 'mock-bg.png' }))
vi.mock('../../../lib/exportPresentationPdf', () => ({ exportPresentationPdf: vi.fn() }))

// Make Image fire onload synchronously so bgImage state is populated before assertions
class SyncImage {
  set src(v) { this._src = v; this.onload?.() }
  get src() { return this._src }
}

beforeEach(() => {
  vi.clearAllMocks()
  global.Image = SyncImage
})

const songs = [{ meta: { title: 'Test Song', artist: null }, sections: [] }]
const defaultProps = {
  isOpen: true,
  songs,
  onClose: vi.fn(),
  onAddToast: vi.fn(),
}

describe('ExportBackgroundModal', () => {
  it('renders Export and Cancel buttons when open', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows a background image preview', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByRole('img', { name: /background preview/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<ExportBackgroundModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls exportPresentationPdf with songs and bgImage when Export is clicked', () => {
    const onClose = vi.fn()
    render(<ExportBackgroundModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(exportPresentationPdf).toHaveBeenCalledOnce()
    expect(exportPresentationPdf).toHaveBeenCalledWith(songs, expect.any(SyncImage), { desiredFont: 20, maxCols: 2 })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when isOpen is false', () => {
    render(<ExportBackgroundModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })

  it('shows a toast and keeps modal open when export fails', () => {
    const onClose = vi.fn()
    const onAddToast = vi.fn()
    exportPresentationPdf.mockImplementation(() => { throw new Error('jsPDF failed') })
    render(<ExportBackgroundModal {...defaultProps} onClose={onClose} onAddToast={onAddToast} />)
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(onAddToast).toHaveBeenCalledWith('PDF export failed: jsPDF failed', 'error')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders Font size input with default 20', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByText('Font size')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(20)  // string '20' renders as numeric 20
  })

  it('renders Max columns button group', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    expect(screen.getByText('Max columns')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('passes changed font size to exportPresentationPdf', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }))
    expect(exportPresentationPdf).toHaveBeenCalledWith(songs, expect.any(SyncImage), { desiredFont: 14, maxCols: 2 })
  })

  it('passes maxCols=1 when column 1 button is clicked', () => {
    render(<ExportBackgroundModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }))
    expect(exportPresentationPdf).toHaveBeenCalledWith(songs, expect.any(SyncImage), { desiredFont: 20, maxCols: 1 })
  })
})
