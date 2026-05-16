import { useRef, useEffect } from 'react'

export function MobileSectionStrip({ sections, activeIndex, onSectionClick }) {
  const stripRef = useRef(null)
  const pillRefs = useRef({})

  const labelledSections = sections
    .map((s, i) => ({ label: s.label, index: i }))
    .filter(({ label }) => label)

  useEffect(() => {
    const pill = pillRefs.current[activeIndex]
    if (pill) {
      pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeIndex])

  if (!labelledSections.length) return null

  return (
    <div className="md:hidden flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div
        ref={stripRef}
        className="flex overflow-x-auto px-3 py-2 gap-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {labelledSections.map(({ label, index }) => (
          <button
            key={index}
            ref={el => { pillRefs.current[index] = el }}
            type="button"
            onClick={() => onSectionClick(index)}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full transition-colors
              ${activeIndex === index
                ? 'bg-indigo-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 active:bg-gray-200 dark:active:bg-gray-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
