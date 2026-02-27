// src/components/PerformanceMode/PerformanceModal.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { loadSong } from '../../lib/storage'
import { SongBody } from '../SongList/SongBody'
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation'
import { ChordStrip } from '../Chords/ChordStrip'

export function PerformanceModal({ song: initialSong, sections: initialSections, lyricsOnly = false, onClose }) {
  const index = useLibraryStore(s => s.index)
  const selectSong = useLibraryStore(s => s.selectSong)

  // Local state so swipe navigation updates both song metadata and content
  const [song, setSong] = useState(initialSong)
  const [sections, setSections] = useState(initialSections)
  const [swipeDir, setSwipeDir] = useState(null)
  const [chordsOpen, setChordsOpen] = useState(true)

  const containerRef = useRef()

  const currentIdx = index.findIndex(e => e.id === song.id)
  const prevEntry = currentIdx > 0 ? index[currentIdx - 1] : null
  const nextEntry = currentIdx < index.length - 1 ? index[currentIdx + 1] : null

  const goNext = useCallback(() => {
    if (!nextEntry) return
    const nextSong = loadSong(nextEntry.id)
    if (!nextSong) return
    selectSong(nextEntry.id)
    setSwipeDir('left')
    setSong(nextSong)
    setSections(nextSong.sections)
  }, [nextEntry, selectSong])

  const goPrev = useCallback(() => {
    if (!prevEntry) return
    const prevSong = loadSong(prevEntry.id)
    if (!prevSong) return
    selectSong(prevEntry.id)
    setSwipeDir('right')
    setSong(prevSong)
    setSections(prevSong.sections)
  }, [prevEntry, selectSong])

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  })

  // Keyboard navigation: ArrowDown/Up scroll by section
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); return }
      const el = containerRef.current
      if (!el) return
      const sectionEls = el.querySelectorAll('[data-section]')
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        for (const s of sectionEls) {
          if (s.getBoundingClientRect().top > window.innerHeight / 2) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const arr = Array.from(sectionEls).reverse()
        for (const s of arr) {
          if (s.getBoundingClientRect().top < 0) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goNext, goPrev])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={song.meta.title}
      className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto"
      ref={containerRef}
      onTouchStart={e => { e.stopPropagation(); onTouchStart(e) }}
      onTouchEnd={e => { e.stopPropagation(); onTouchEnd(e) }}
    >
      {/* Top controls */}
      <div className="sticky top-0 flex items-center justify-between px-6 py-3
        bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div>
          <span className="text-2xl font-bold">{song.meta.title}</span>
          {song.meta.artist && <span className="ml-3 text-gray-500">{song.meta.artist}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          ✕ Exit
        </button>
      </div>

      {/* Chord diagram strip */}
      <ChordStrip
        sections={sections}
        open={chordsOpen}
        onToggle={() => setChordsOpen(o => !o)}
      />

      {/* Song content — keyed so animation restarts on each song change */}
      <div
        key={song.id}
        className={`max-w-3xl mx-auto px-8 py-8
          ${swipeDir === 'left'  ? 'animate-slideFromRight' : ''}
          ${swipeDir === 'right' ? 'animate-slideFromLeft'  : ''}
        `}
        onAnimationEnd={() => setSwipeDir(null)}
      >
        <SongBody
          sections={sections}
          fontSize={22}
          performanceMode={true}
          lyricsOnly={lyricsOnly}
        />
      </div>
    </div>
  )
}
