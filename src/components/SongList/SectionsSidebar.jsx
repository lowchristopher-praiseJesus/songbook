export function SectionsSidebar({ sections, activeIndex, open, onToggle, onSectionClick }) {
  const labelledSections = sections
    .map((s, i) => ({ label: s.label, index: i }))
    .filter(({ label }) => label)

  return (
    <div className="hidden md:flex flex-row flex-shrink-0">
      <div className="flex flex-col justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Hide sections panel' : 'Show sections panel'}
          className="bg-indigo-500 text-white rounded-r-md cursor-pointer border-0"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            padding: '10px 4px',
          }}
        >
          SECTIONS
        </button>
      </div>
      {open && (
        <div className="flex flex-col w-[90px]
          border-r border-gray-200 dark:border-gray-700
          bg-gray-50 dark:bg-gray-900">
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {labelledSections.map(({ label, index }) => (
              <button
                key={index}
                type="button"
                onClick={() => onSectionClick(index)}
                className={`w-full text-left text-[10px] font-medium px-2 py-1 rounded-full
                  transition-colors flex items-center gap-1.5
                  ${activeIndex === index
                    ? 'bg-indigo-500 text-white'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
              >
                {activeIndex !== index && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full
                    bg-gray-400 dark:bg-gray-600 flex-shrink-0" />
                )}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
