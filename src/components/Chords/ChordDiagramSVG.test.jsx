import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChordDiagramSVG } from './ChordDiagramSVG'

// C major: x32010 — muted low E, open G and high e, 3 finger dots
const cMajor = {
  frets: [-1, 3, 2, 0, 1, 0],
  fingers: [0, 3, 2, 0, 1, 0],
  baseFret: 1,
  barres: [],
}

// Bm barre at fret 2
const bm = {
  frets: [-1, 1, 3, 3, 2, 1],
  fingers: [0, 1, 3, 4, 2, 1],
  baseFret: 2,
  barres: [1],
}

describe('ChordDiagramSVG', () => {
  test('renders an SVG with correct viewBox', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('viewBox')).toBe('0 0 84 116')
  })

  test('renders the chord name', () => {
    const { getByText } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    expect(getByText('C')).toBeTruthy()
  })

  test('renders 6 vertical string lines (y1=26 to y2=98)', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const lines = [...container.querySelectorAll('line')]
    const stringLines = lines.filter(
      l => l.getAttribute('y1') === '26' && l.getAttribute('y2') === '98'
    )
    expect(stringLines).toHaveLength(6)
  })

  test('renders the nut rect when baseFret is 1', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    const rects = [...container.querySelectorAll('rect')]
    const nut = rects.find(
      r => r.getAttribute('y') === '22' && r.getAttribute('height') === '4'
    )
    expect(nut).toBeTruthy()
  })

  test('renders fret position label when baseFret > 1', () => {
    const { getByText } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    expect(getByText('2fr')).toBeTruthy()
  })

  test('does not render nut rect when baseFret > 1', () => {
    const { container } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    const rects = [...container.querySelectorAll('rect')]
    const nut = rects.find(
      r => r.getAttribute('y') === '22' && r.getAttribute('height') === '4'
    )
    expect(nut).toBeFalsy()
  })

  test('renders a rounded barre rect when barres is non-empty', () => {
    const { container } = render(<ChordDiagramSVG fingering={bm} name="Bm" />)
    const rects = [...container.querySelectorAll('rect')]
    const barre = rects.find(r => r.getAttribute('rx') === '5')
    expect(barre).toBeTruthy()
  })

  test('renders filled circles for non-barre fretted strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // Filled circles have no fill="none" attribute (fill is set via Tailwind class)
    const filled = [...container.querySelectorAll('circle')]
      .filter(c => c.getAttribute('fill') !== 'none')
    // C major: B@fret1, D@fret2, A@fret3 — 3 filled dots
    expect(filled.length).toBeGreaterThanOrEqual(3)
  })

  test('renders open circles (fill="none") for open strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // C major has G (index 3) and high e (index 5) as open strings
    const openCircles = [...container.querySelectorAll('circle')]
      .filter(c => c.getAttribute('fill') === 'none')
    expect(openCircles).toHaveLength(2)
  })

  test('renders muted marker lines for muted strings', () => {
    const { container } = render(<ChordDiagramSVG fingering={cMajor} name="C" />)
    // C major: low E is muted → 2 crossing lines per muted string
    // Muted lines go from y=14 to y=20 (not y=26 to y=98 like string lines)
    const mutedLines = [...container.querySelectorAll('line')]
      .filter(l => l.getAttribute('y1') === '14' && l.getAttribute('y2') === '20')
    expect(mutedLines).toHaveLength(2)  // 2 lines for 1 muted string (the ✕ cross)
  })
})
