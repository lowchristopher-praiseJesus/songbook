import { useState, useRef } from 'react'
import { FONT_OPTIONS } from '../../hooks/useDisplaySettings'

const PALETTE = ['#374151', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#9ca3af']

const ELEMENTS = [
  { key: 'lyrics',      label: 'Lyrics',      hasAbsoluteSize: false },
  { key: 'chords',      label: 'Chords',      hasAbsoluteSize: false, isOffset: true },
  { key: 'sections',    label: 'Sections',    hasAbsoluteSize: true },
  { key: 'annotations', label: 'Annotations', hasAbsoluteSize: true },
]

function ColorDot({ color, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={color}
      className="rounded-full border-2 transition-all focus:outline-none"
      style={{
        width: 22,
        height: 22,
        background: color,
        borderColor: selected ? color : 'transparent',
        boxShadow: selected ? `0 0 0 1px white, 0 0 0 3px ${color}` : undefined,
      }}
      aria-pressed={selected}
    />
  )
}

function SummaryDot({ color }) {
  return (
    <span
      style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, verticalAlign: 'middle', marginRight: 2 }}
    />
  )
}

function ElementRow({ elementKey, label, isOffset, hasAbsoluteSize, elSettings, fontSize, onFontSizeChange, updateElement }) {
  const [open, setOpen] = useState(false)
  const colorInputRef = useRef(null)

  const currentColor = elSettings.color
  const currentFont = elSettings.font
  const currentSize = isOffset
    ? elSettings.sizeOffset
    : (hasAbsoluteSize ? elSettings.size : fontSize)

  function sizeLabel() {
    if (isOffset) return currentSize === 0 ? '0' : `${currentSize > 0 ? '+' : ''}${currentSize}`
    return `${currentSize}px`
  }

  function handleSizeDown() {
    if (isOffset) {
      const next = Math.max(-8, currentSize - 1)
      updateElement(elementKey, { sizeOffset: next })
    } else if (hasAbsoluteSize) {
      updateElement(elementKey, { size: Math.max(8, currentSize - 1) })
    } else {
      onFontSizeChange(Math.max(12, fontSize - 1))
    }
  }

  function handleSizeUp() {
    if (isOffset) {
      const next = Math.min(0, currentSize + 1)
      updateElement(elementKey, { sizeOffset: next })
    } else if (hasAbsoluteSize) {
      updateElement(elementKey, { size: Math.min(32, currentSize + 1) })
    } else {
      onFontSizeChange(Math.min(28, fontSize + 1))
    }
  }

  function handleCustomColor(e) {
    updateElement(elementKey, { color: e.target.value })
  }

  const summaryText = `${currentFont === 'System Default' ? 'System' : currentFont} · ${sizeLabel()}`

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <SummaryDot color={currentColor} />
          {summaryText}
          <span className="ml-1">{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="px-3 py-3 bg-white dark:bg-gray-800 space-y-3">
          {/* Font */}
          <div>
            <div className="text-xs text-gray-400 mb-1">Font</div>
            <select
              value={currentFont}
              onChange={e => updateElement(elementKey, { font: e.target.value })}
              className="w-full text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-md
                bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {FONT_OPTIONS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Size */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400">Size{isOffset ? ' offset' : ''}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSizeDown}
                className="w-6 h-6 flex items-center justify-center border border-gray-200 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm"
              >−</button>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-10 text-center">{sizeLabel()}</span>
              <button
                type="button"
                onClick={handleSizeUp}
                className="w-6 h-6 flex items-center justify-center border border-gray-200 dark:border-gray-600 rounded
                  bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm"
              >+</button>
            </div>
          </div>

          {/* Color */}
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Color</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PALETTE.map(c => (
                <ColorDot
                  key={c}
                  color={c}
                  selected={currentColor === c}
                  onClick={() => updateElement(elementKey, { color: c })}
                />
              ))}
              {/* Custom swatch — rainbow gradient, opens native color picker */}
              <button
                type="button"
                title="Custom color"
                onClick={() => colorInputRef.current?.click()}
                className="rounded-full border border-gray-300 focus:outline-none"
                style={{
                  width: 22,
                  height: 22,
                  background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                  boxShadow: !PALETTE.includes(currentColor) ? `0 0 0 1px white, 0 0 0 3px ${currentColor}` : undefined,
                }}
                aria-label="Custom color"
              />
              <input
                ref={colorInputRef}
                type="color"
                value={currentColor}
                onChange={handleCustomColor}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DisplayTab({ settings, updateElement, resetAll, fontSize, onFontSizeChange }) {
  return (
    <div>
      {ELEMENTS.map(({ key, label, isOffset, hasAbsoluteSize }) => (
        <ElementRow
          key={key}
          elementKey={key}
          label={label}
          isOffset={isOffset}
          hasAbsoluteSize={hasAbsoluteSize}
          elSettings={settings[key]}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          updateElement={updateElement}
        />
      ))}
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
