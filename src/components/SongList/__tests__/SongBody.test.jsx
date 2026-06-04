import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
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
    // E/// at pos 0 (4 chars), cursor→4; A at pos 6, gap=2; cursor→7; G at pos 12, gap=5
    // The chord line div is aria-hidden, so query directly
    const chordDiv = container.querySelector('[aria-hidden="true"]')
    expect(chordDiv?.textContent).toBe('E///  A     G')
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

  // The chord anchor is the inline-block span that holds one lyric character with the
  // absolute-positioned chord label above it.
  function chordAnchors(container) {
    return [...container.querySelectorAll('span.relative.inline-block')]
  }

  it('does not reserve minWidth for an isolated mid-word chord (no word splitting)', () => {
    const sections = [{
      label: null,
      lines: [{
        type: 'lyric',
        content: 'beloved is the most beautiful',
        // Em mid-word over the second char; C far away near the end → no collision
        chords: [{ chord: 'Em', position: 1, strum: null }, { chord: 'C', position: 25, strum: null }],
        annotation: null,
      }],
    }]
    const { container } = render(<SongBody sections={sections} />)
    const anchors = chordAnchors(container)
    expect(anchors).toHaveLength(2)
    // Neither chord should reserve width — the word must not be split.
    expect(anchors.every(a => a.style.minWidth === '')).toBe(true)
  })

  it('reserves minWidth when a wide chord would collide with the next chord', () => {
    const sections = [{
      label: null,
      lines: [{
        type: 'lyric',
        content: 'abcdef',
        // Dm7 (wide) immediately followed by G one char later → would overlap → reserve
        chords: [{ chord: 'Dm7', position: 0, strum: null }, { chord: 'G', position: 1, strum: null }],
        annotation: null,
      }],
    }]
    const { container } = render(<SongBody sections={sections} />)
    const anchors = chordAnchors(container)
    // The first (wide) chord must reserve width to clear the next chord.
    expect(anchors[0].style.minWidth).not.toBe('')
  })
})

describe('SongBody section heading badge', () => {
  it('renders section label inside a span with border style', () => {
    render(<SongBody sections={[{ label: 'Verse 1', lines: [] }]} />)
    const badge = screen.getByText('Verse 1')
    expect(badge.tagName).toBe('SPAN')
    expect(badge.style.border).toContain('2px solid')
    expect(badge.style.borderRadius).toBe('6px')
    expect(badge.style.padding).toBe('2px 10px')
  })
})

describe('SongBody sectionRefs', () => {
  it('attaches sectionRefs to section root divs', () => {
    const ref0 = createRef()
    const ref1 = createRef()
    render(
      <SongBody
        sections={[
          { label: 'Intro', lines: [] },
          { label: 'Verse 1', lines: [] },
        ]}
        sectionRefs={[ref0, ref1]}
      />
    )
    expect(ref0.current).not.toBeNull()
    expect(ref1.current).not.toBeNull()
    expect(ref0.current).toHaveAttribute('data-section')
    expect(ref1.current).toHaveAttribute('data-section')
  })

  it('renders without error when sectionRefs is omitted', () => {
    expect(() =>
      render(<SongBody sections={[{ label: 'Intro', lines: [] }]} />)
    ).not.toThrow()
  })
})
