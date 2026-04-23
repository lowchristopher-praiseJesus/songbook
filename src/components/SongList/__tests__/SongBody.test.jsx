import { describe, it, expect } from 'vitest'
import { render, screen, getDefaultNormalizer } from '@testing-library/react'
import { SongBody } from '../SongBody'

const noCollapse = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }

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

describe('SongBody inline strum rendering', () => {
  // Standalone chord line: E with strum ///, A and G without strum
  const standaloneSections = [
    {
      label: 'Intro',
      annotation: null,
      lines: [
        {
          type: 'chord', content: '', annotation: null,
          chords: [
            { chord: 'E', position: 0, strum: '///' },
            { chord: 'A', position: 6, strum: null },
            { chord: 'G', position: 12, strum: null },
          ],
        },
      ],
    },
  ]

  // Lyric line with inline chord strum
  const lyricSections = [
    {
      label: 'Verse',
      annotation: null,
      lines: [
        {
          type: 'lyric', content: 'Amazing grace', annotation: null,
          chords: [{ chord: 'G', position: 0, strum: '////' }],
        },
      ],
    },
  ]

  it('renders chord+strum inline in a standalone chord line', () => {
    const { container } = render(<SongBody sections={standaloneSections} />)
    // E/// at pos 0 (5 chars), A at pos 6 (pad 1 space), G at pos 12 (pad 4 spaces)
    // The chord line div is aria-hidden, so query directly
    const chordDiv = container.querySelector('[aria-hidden="true"]')
    expect(chordDiv?.textContent).toBe('E///  A     G ')
  })

  it('renders chord+strum inline above lyrics in a lyric line', () => {
    render(<SongBody sections={lyricSections} />)
    expect(screen.getByText('G////')).toBeInTheDocument()
  })

  it('chord without strum shows chord name only', () => {
    render(<SongBody sections={standaloneSections} />)
    // Chord line text should not show "Anull" or similar
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })
})
