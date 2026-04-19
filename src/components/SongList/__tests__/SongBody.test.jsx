import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SongBody } from '../SongBody'

const sections = [
  {
    label: 'Chorus',
    annotation: 'xx and yy to sing this',
    lines: [
      { type: 'lyric', content: 'Amazing grace', chords: [], annotation: 'sing softly' },
      { type: 'lyric', content: 'How sweet the sound', chords: [], annotation: null },
      { type: 'blank', content: '', chords: [], annotation: null },
    ],
  },
]

describe('SongBody annotation rendering', () => {
  it('renders section annotation when annotationsVisible is true', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.getByText('— xx and yy to sing this')).toBeInTheDocument()
  })

  it('renders line annotation when annotationsVisible is true', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.getByText('— sing softly')).toBeInTheDocument()
  })

  it('hides section annotation when annotationsVisible is false', () => {
    render(<SongBody sections={sections} annotationsVisible={false} />)
    expect(screen.queryByText('— xx and yy to sing this')).not.toBeInTheDocument()
  })

  it('hides line annotation when annotationsVisible is false', () => {
    render(<SongBody sections={sections} annotationsVisible={false} />)
    expect(screen.queryByText('— sing softly')).not.toBeInTheDocument()
  })

  it('defaults annotationsVisible to true when prop omitted', () => {
    render(<SongBody sections={sections} />)
    expect(screen.getByText('— xx and yy to sing this')).toBeInTheDocument()
  })

  it('does not render annotation dash when line.annotation is null', () => {
    render(<SongBody sections={sections} annotationsVisible={true} />)
    expect(screen.queryByText('— null')).not.toBeInTheDocument()
  })
})
