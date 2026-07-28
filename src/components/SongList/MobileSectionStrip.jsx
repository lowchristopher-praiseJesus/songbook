import { useRef, useEffect, useState, useCallback } from 'react'

export function MobileSectionStrip({ sections, activeIndex, onSectionClick }) {
  const stripRef = useRef(null)
  const pillRefs = useRef({})
  // Whether the strip currently overflows past its start/end — drives the
  // edge fade hints that signal there's more to scroll to.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const labelledSections = sections
    .map((s, i) => ({ label: s.label, index: i }))
    .filter(({ label }) => label)

  const updateEdges = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 0)
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges, labelledSections.length])

  useEffect(() => {
    const pill = pillRefs.current[activeIndex]
    if (pill) {
      pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeIndex])

  if (!labelledSections.length) return null

  return (
    <div className="relative md:hidden flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div
        ref={stripRef}
        className="flex overflow-x-auto px-3 py-2 gap-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        onScroll={updateEdges}
      >
        {labelledSections.map(({ label, index }) => (
          <button
            key={index}
            ref={el => { pillRefs.current[index] = el }}
            type="button"
            onClick={() => onSectionClick(index)}
            className={`flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-full transition-colors
              ${activeIndex === index
                ? 'bg-indigo-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        data-testid="section-strip-fade-left"
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-6
          bg-gradient-to-r from-white dark:from-gray-900 to-transparent
          transition-opacity duration-150 ${atStart ? 'opacity-0' : 'opacity-100'}`}
      />
      <div
        data-testid="section-strip-fade-right"
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 bottom-0 w-6
          bg-gradient-to-l from-white dark:from-gray-900 to-transparent
          transition-opacity duration-150 ${atEnd ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  )
}
