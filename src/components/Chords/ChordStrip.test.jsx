import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChordStrip } from './ChordStrip'

// Minimal sections fixture with known chords
const sections = [
  {
    label: 'Verse',
    lines: [
      { type: 'lyric',  content: 'Hello',  chords: [{ chord: 'G',    position: 0 }] },
      { type: 'lyric',  content: 'World',  chords: [{ chord: 'Am',   position: 0 }] },
      { type: 'lyric',  content: 'Again',  chords: [{ chord: 'G',    position: 0 }] }, // duplicate G
      { type: 'lyric',  content: 'Slash',  chords: [{ chord: 'G/B',  position: 0 }] }, // slash → G, already present
      { type: 'chord',  content: '',       chords: [{ chord: 'Cmaj7',position: 0 }] },
    ],
  },
]

describe('ChordStrip', () => {
  it('renders a toggle button', () => {
    render(<ChordStrip sections={sections} open onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /chords/i })).toBeInTheDocument()
  })

  it('shows chord diagrams when open=true', () => {
    render(<ChordStrip sections={sections} open onToggle={() => {}} />)
    // G, Am, Cmaj7 — three unique chords (G/B deduped as G)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(3)
  })

  it('hides chord diagrams when open=false', () => {
    render(<ChordStrip sections={sections} open={false} onToggle={() => {}} />)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(0)
  })

  it('calls onToggle when button clicked', () => {
    const onToggle = vi.fn()
    render(<ChordStrip sections={sections} open onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /chords/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('skips chords not in the sprite map', () => {
    const withUnknown = [{ label: '', lines: [
      { type: 'lyric', content: 'x', chords: [{ chord: 'Cadd9', position: 0 }] },
      { type: 'lyric', content: 'y', chords: [{ chord: 'G',     position: 0 }] },
    ]}]
    render(<ChordStrip sections={withUnknown} open onToggle={() => {}} />)
    const diagrams = document.querySelectorAll('[data-chord]')
    expect(diagrams).toHaveLength(1) // only G
  })

  it('returns null when no mappable chords exist', () => {
    const empty = [{ label: '', lines: [
      { type: 'lyric', content: 'x', chords: [{ chord: 'Cadd9', position: 0 }] },
    ]}]
    const { container } = render(<ChordStrip sections={empty} open onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when sections is empty', () => {
    const { container } = render(<ChordStrip sections={[]} open onToggle={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
