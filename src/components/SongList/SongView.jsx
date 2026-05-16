import { useState, useRef, useEffect, useCallback, createRef } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { SongList } from './SongList'
import { SectionsSidebar } from './SectionsSidebar'

export function SongView({
  song,
  onPerformanceMode,
  lyricsOnly,
  fontSize,
  onFontSizeChange,
  chordsOpen,
  onChordsToggle,
  onEdit,
  isFit,
  containerRef,
}) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage('songsheet_sections_panel_open', false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [bodyOffset, setBodyOffset] = useState(0)
  const sectionRefs = useRef([])
  const headerRef = useRef(null)

  // Re-create refs array whenever the song changes
  const sectionsLen = song.sections?.length ?? 0
  if (sectionRefs.current.length !== sectionsLen) {
    sectionRefs.current = Array.from({ length: sectionsLen }, () => createRef())
  }

  useEffect(() => {
    setActiveIndex(0)
  }, [song.id])

  // Measure the header+chords area height so the sidebar can align with the song body
  useEffect(() => {
    const header = headerRef.current
    const container = containerRef?.current
    if (!header || !container) return

    const measure = () => {
      const hRect = header.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      // Static layout offset: how far below the container top the body starts.
      // Adding container.scrollTop removes the scroll component from getBoundingClientRect.
      setBodyOffset(Math.max(0, hRect.bottom + container.scrollTop - cRect.top))
    }

    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(header)
    return () => obs.disconnect()
  }, [song.id, containerRef])

  // IntersectionObserver: highlight the topmost visible section
  useEffect(() => {
    const elements = sectionRefs.current.map(r => r.current).filter(Boolean)
    const visibleSet = new Set()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleSet.add(entry.target)
          else visibleSet.delete(entry.target)
        }
        const sorted = [...visibleSet].sort(
          (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
        )
        if (sorted.length > 0) {
          const idx = elements.indexOf(sorted[0])
          if (idx !== -1) setActiveIndex(idx)
        }
      },
      { threshold: 0, rootMargin: '0px 0px -60% 0px' }
    )

    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [song.id])

  const handleSectionClick = useCallback((i) => {
    sectionRefs.current[i]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      <SectionsSidebar
        sections={song.sections ?? []}
        activeIndex={activeIndex}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSectionClick={handleSectionClick}
        topOffset={bodyOffset}
      />
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden" ref={containerRef}>
        <SongList
          song={song}
          onPerformanceMode={onPerformanceMode}
          lyricsOnly={lyricsOnly}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          chordsOpen={chordsOpen}
          onChordsToggle={onChordsToggle}
          onEdit={onEdit}
          isFit={isFit}
          containerRef={containerRef}
          sectionRefs={sectionRefs.current}
          headerRef={headerRef}
        />
      </div>
    </div>
  )
}
