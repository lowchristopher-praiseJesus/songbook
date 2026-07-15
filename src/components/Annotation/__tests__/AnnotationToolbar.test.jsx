import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnnotationToolbar } from '../AnnotationToolbar'
import { useAnnotationStore } from '../../../store/annotationStore'

beforeEach(() => {
  localStorage.clear()
  useAnnotationStore.getState().loadForSong('song-1')
  useAnnotationStore.setState({ tool: 'pen' })
})

describe('AnnotationToolbar', () => {
  it('renders a drag grip handle', () => {
    render(<AnnotationToolbar />)
    expect(screen.getByLabelText('Drag to reposition toolbar')).toBeInTheDocument()
  })

  it('clicking the eraser tool still works normally (not treated as a drag)', () => {
    render(<AnnotationToolbar />)
    fireEvent.click(screen.getByLabelText('Eraser tool'))
    expect(screen.getByLabelText('Eraser tool')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Pen tool')).toHaveAttribute('aria-pressed', 'false')
  })

  it('uses the default left/center position when no position is stored', () => {
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveStyle({ left: '1rem', top: '50%' })
  })

  it('applies a stored position as inline left/top styles', () => {
    localStorage.setItem('songsheet_annotation_pill_pos', JSON.stringify({ x: 300, y: 120 }))
    render(<AnnotationToolbar />)
    const pill = screen.getByLabelText('Drag to reposition toolbar').closest('[data-pill-root]')
    expect(pill).toHaveStyle({ left: '300px', top: '120px' })
  })
})
