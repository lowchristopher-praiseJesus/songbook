import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

function stubPointer(coarse) {
  vi.stubGlobal('matchMedia', vi.fn(query => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

afterEach(() => vi.unstubAllGlobals())

describe('EmptyState import hint', () => {
  it('tells touch users to tap Import (drag-and-drop is meaningless on touch)', () => {
    stubPointer(true)
    render(<EmptyState onFileChange={vi.fn()} />)
    expect(screen.getByText('Tap Import File to get started')).toBeInTheDocument()
    expect(screen.queryByText(/Drag a file here/)).not.toBeInTheDocument()
  })

  it('keeps the drag hint for mouse users', () => {
    stubPointer(false)
    render(<EmptyState onFileChange={vi.fn()} />)
    expect(screen.getByText('Drag a file here to get started')).toBeInTheDocument()
  })

  it('defaults to the drag hint when matchMedia is unavailable', () => {
    render(<EmptyState onFileChange={vi.fn()} />)
    expect(screen.getByText('Drag a file here to get started')).toBeInTheDocument()
  })
})
