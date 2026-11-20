import { useState } from 'react'

const STORAGE_KEY = 'songsheet_syntax_help_open'

const RULES = [
  ['{c: Verse}', 'section header'],
  ['[G]', 'chord, placed before a syllable'],
  ['{note: text}', 'annotation'],
  ['{highlight: text}', 'highlighted annotation'],
  ['[G]{strum: ///}', 'strum pattern'],
]

function readOpen() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function writeOpen(open) {
  try { localStorage.setItem(STORAGE_KEY, open ? '1' : '0') } catch { /* storage unavailable */ }
}

/**
 * Collapsible song-syntax cheat sheet. Collapsed by default so it never
 * crowds out the lyrics textarea on phones; open state is remembered.
 */
export function SyntaxHint({ className = '' }) {
  const [open, setOpen] = useState(readOpen)

  const toggle = () => {
    setOpen(o => { writeOpen(!o); return !o })
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400
                   hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-indigo-500 rounded select-none"
      >
        <span aria-hidden="true">ⓘ</span>
        Syntax help
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
          {RULES.map(([syntax, meaning]) => (
            <div key={syntax} className="contents">
              <dt className="font-mono text-gray-700 dark:text-gray-300">{syntax}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
