import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { AnnotatedMaximizeView } from '../AnnotatedMaximizeView'
import { useAnnotationStore } from '../../../store/annotationStore'

function mockContainer(clientHeight) {
  return {
    clientHeight,
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
  }
}

const sections = [
  { label: 'Verse', lines: [{ type: 'lyric', content: 'Hello world', chords: [] }] },
]

describe('AnnotatedMaximizeView recovers when containerRef is not yet attached on mount', () => {
  let rafCallbacks

  beforeEach(() => {
    useAnnotationStore.setState({
      baseline: { fontSize: 20, columns: 2, width: 800, height: 500, paginated: false },
      annotateMode: false,
      userZoom: 1,
      pan: { x: 0, y: 0 },
    })
    vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })))
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { rafCallbacks.push(cb); return rafCallbacks.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recovers the correct available height once containerRef attaches on the next animation frame', () => {
    // Reproduces the real bug: containerRef is a prop attached by an
    // ancestor component (SongView), not by AnnotatedMaximizeView itself.
    // React fires layout effects bottom-up (children before parents), so
    // on a fresh mount where this component is born directly into the
    // baseline branch (e.g. entering maximize mode on an already-annotated
    // song), its own layout effect can run before the ancestor's commit
    // step has attached containerRef.current — leaving it null at that
    // exact instant.
    const containerRef = { current: null }

    const { container } = render(
      <AnnotatedMaximizeView
        sections={sections}
        fontSize={16}
        lyricsOnly={false}
        annotationsVisible={true}
        containerRef={containerRef}
      />
    )
    const outer = container.firstChild

    // Synchronous first pass found containerRef.current still null, so it
    // could only leave the initial default in place.
    expect(outer.style.height).toBe('0px')

    // The ancestor's own commit step attaches containerRef.current shortly
    // after, still within the same overall commit (before the next paint).
    containerRef.current = mockContainer(500)
    // Flush the animation-frame re-measure this component schedules as a
    // fallback for exactly this race.
    act(() => { rafCallbacks.forEach(cb => cb()) })

    expect(outer.style.height).toBe('500px')
  })
})
