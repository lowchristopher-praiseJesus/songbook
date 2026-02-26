// src/components/PerformanceMode/PerformanceModal.jsx
import { useEffect, useRef } from 'react'
import { useTranspose } from '../../hooks/useTranspose'
import { SongBody } from '../SongSheet/SongBody'

export function PerformanceModal({ song, onClose }) {
  const transpose = useTranspose(song.sections, song.meta.usesFlats)
  const containerRef = useRef()

  // Keyboard navigation: ArrowDown/Up scroll by section
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      const el = containerRef.current
      if (!el) return
      const sections = el.querySelectorAll('[data-section]')
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        // Find first section below viewport center
        for (const s of sections) {
          if (s.getBoundingClientRect().top > window.innerHeight / 2) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const arr = Array.from(sections).reverse()
        for (const s of arr) {
          if (s.getBoundingClientRect().top < window.innerHeight / 3) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={song.meta.title}
      className="fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-y-auto"
      ref={containerRef}
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

      {/* Song content at large font */}
      <div className="max-w-3xl mx-auto px-8 py-8">
        <SongBody
          sections={transpose.transposedSections}
          fontSize={22}
          performanceMode={true}
        />
      </div>
    </div>
  )
}
