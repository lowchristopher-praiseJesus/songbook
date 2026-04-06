import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SongList } from '../SongList'

// Stub out hooks/modules that need real infrastructure
vi.mock('../../../hooks/useTranspose', () => ({
  useTranspose: vi.fn(() => ({
    delta: 0,
    capo: 0,
    capoUp: vi.fn(),
    capoDown: vi.fn(),
    transposeTo: vi.fn(),
    transposedSections: [
      { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello', chords: [] }] },
    ],
    usesFlats: false,
  })),
}))

vi.mock('../../../hooks/useFitToScreen', () => ({
  useFitToScreen: vi.fn(() => ({
    fitFontSize: 18,
    fitColumns: 2,
    shadowRef: { current: null },
  })),
}))

vi.mock('../../../lib/exportPdf', () => ({ exportLyricsPdf: vi.fn() }))

const song = {
  id: 'song-1',
  meta: { title: 'Test', keyIndex: 0 },
  sections: [],
}

const containerRef = { current: document.createElement('div') }

describe('SongList fitMode', () => {
  it('renders a hidden shadow SongBody when isFit is true', () => {
    const { container } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={true}
        containerRef={containerRef}
      />
    )
    // Shadow div has position absolute and top -9999px
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).not.toBeNull()
  })

  it('does not render shadow SongBody when isFit is false', () => {
    const { container } = render(
      <SongList
        song={song}
        onPerformanceMode={vi.fn()}
        lyricsOnly={false}
        fontSize={16}
        onFontSizeChange={vi.fn()}
        chordsOpen={true}
        onChordsToggle={vi.fn()}
        onEdit={vi.fn()}
        isFit={false}
        containerRef={containerRef}
      />
    )
    const shadow = container.querySelector('[style*="-9999"]')
    expect(shadow).toBeNull()
  })
})
