import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { SongHeader } from '../SongHeader'

const meta = { title: 'Test Song', keyIndex: 0 }
const transpose = {
  delta: 0,
  capo: 0,
  capoUp: vi.fn(),
  capoDown: vi.fn(),
  transposeTo: vi.fn(),
  transposedSections: [],
  usesFlats: false,
}

describe('SongHeader headerRef', () => {
  it('attaches headerRef to the root div', () => {
    const headerRef = createRef()
    render(
      <SongHeader
        meta={meta}
        transpose={transpose}
        lyricsOnly={false}
        onPerformanceMode={vi.fn()}
        onExportPdf={vi.fn()}
        onEdit={vi.fn()}
        headerRef={headerRef}
      />
    )
    expect(headerRef.current).not.toBeNull()
    expect(headerRef.current.tagName).toBe('DIV')
  })
})
