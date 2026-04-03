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
    expect(exportPresentationPdf).toHaveBeenCalledWith(songs, expect.any(SyncImage))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when isOpen is false', () => {
    render(<ExportBackgroundModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })
})
