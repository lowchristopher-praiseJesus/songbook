import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KeyCheckModal } from '../KeyCheckModal'

const matchingResult = {
  statedKey: 'C',
  detectedKey: 'C',
  keyMatches: true,
  outlierChords: [],
  totalChords: 4,
}

const mismatchResult = {
  statedKey: 'C',
  detectedKey: 'B',
  keyMatches: false,
  outlierChords: [
    { chord: 'E', count: 2, exampleLine: 0, exampleText: '[C]one [E]two' },
  ],
  totalChords: 4,
}

describe('KeyCheckModal', () => {
  it('renders nothing when closed', () => {
    render(<KeyCheckModal isOpen={false} result={matchingResult} onUpdateKey={() => {}} onCancel={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a matching confirmation and no Update key button when keys match', () => {
    render(<KeyCheckModal isOpen result={matchingResult} onUpdateKey={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/key matches/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /update key/i })).not.toBeInTheDocument()
  })

  it('shows detected vs stated key and an Update key button on mismatch', () => {
    render(<KeyCheckModal isOpen result={mismatchResult} onUpdateKey={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update key/i })).toBeInTheDocument()
  })

  it('calls onUpdateKey with the detected key when Update key is clicked', () => {
    const onUpdateKey = vi.fn()
    render(<KeyCheckModal isOpen result={mismatchResult} onUpdateKey={onUpdateKey} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /update key/i }))
    expect(onUpdateKey).toHaveBeenCalledWith('B')
  })

  it('lists outlier chords with their occurrence count', () => {
    render(<KeyCheckModal isOpen result={mismatchResult} onUpdateKey={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.getByText(/2×/)).toBeInTheDocument()
  })

  it('shows a no-outliers message when the outlier list is empty', () => {
    render(<KeyCheckModal isOpen result={matchingResult} onUpdateKey={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('No out-of-key chords found.')).toBeInTheDocument()
  })

  it('calls onCancel when Close is clicked', () => {
    const onCancel = vi.fn()
    render(<KeyCheckModal isOpen result={matchingResult} onUpdateKey={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
