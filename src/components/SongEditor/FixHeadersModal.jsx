import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'

export function FixHeadersModal({ isOpen, detections, onApply, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(detections.map((_, i) => i)))

  // Reset selection whenever the modal opens with a new set of detections
  useEffect(() => {
    if (isOpen) setSelected(new Set(detections.map((_, i) => i)))
  }, [isOpen, detections])

  const allChecked = selected.size === detections.length
  const noneChecked = selected.size === 0

  function toggleOne(idx) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(detections.map((_, i) => i)))
  }

  function handleApply() {
    onApply(detections.filter((_, i) => selected.has(i)))
  }

  return (
    <Modal isOpen={isOpen} title="Convert Section Headers" onClose={onCancel}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Select the lines to convert:
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 focus:outline-none"
        >
          {allChecked ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <ul className="space-y-1 mb-5 max-h-60 overflow-y-auto">
        {detections.map((d, idx) => (
          <li
            key={idx}
            onClick={() => toggleOne(idx)}
            className="flex items-baseline gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none
                       hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <input
              type="checkbox"
              checked={selected.has(idx)}
              onChange={() => toggleOne(idx)}
              onClick={e => e.stopPropagation()}
              className="mt-0.5 shrink-0 accent-indigo-600"
            />
            <span className="text-sm font-mono flex flex-wrap items-baseline gap-x-2 min-w-0">
              <span className="text-gray-500 dark:text-gray-400">{d.original.trim()}</span>
              <span className="text-gray-400">→</span>
              <span className="text-indigo-600 dark:text-indigo-400">{d.proposed}</span>
              {d.confidence === 'low' && (
                <span className="text-xs text-amber-500 font-sans">(possible typo)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={noneChecked}
          className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg
                     hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply{selected.size < detections.length && selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>
    </Modal>
  )
}
