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
  const sectionRefs = useRef([])

  // Re-create refs array whenever the song changes
  const sectionsLen = song.sections?.length ?? 0
  if (sectionRefs.current.length !== sectionsLen) {
    sectionRefs.current = Array.from({ length: sectionsLen }, () => createRef())
  }

  useEffect(() => {
    setActiveIndex(0)
    sectionRefs.current = Array.from(
      { length: song.sections?.length ?? 0 },
      () => createRef()
    )
  }, [song.id])

  // IntersectionObserver: highlight the topmost visible section
  useEffect(() => {
    const elements = sectionRefs.current.map(r => r.current).filter(Boolean)

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (intersecting.length > 0) {
          const idx = elements.indexOf(intersecting[0].target)
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
    <div className="flex h-full relative">
      <SectionsSidebar
        sections={song.sections ?? []}
        activeIndex={activeIndex}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        onSectionClick={handleSectionClick}
      />
      <div className="flex-1 min-w-0">
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
        />
      </div>
    </div>
  )
}
