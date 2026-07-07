import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function FixChordsModal({ isOpen, detections, onApply, onCancel }) {
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
    <Modal isOpen={isOpen} title="Merge Chords Into Lyrics" onClose={onCancel}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Select the chord lines to fix:
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
        >
          {allChecked ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <ul className="max-h-60 overflow-y-auto space-y-0.5 mb-4">
        {detections.map((d, idx) => (
          <li key={idx}>
            <label className="flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer select-none
                              hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={selected.has(idx)}
                onChange={() => toggleOne(idx)}
                className="h-4 w-4 shrink-0 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-mono flex flex-col gap-0.5 min-w-0 overflow-x-auto">
                {d.original.split('\n').map((origLine, i) => (
                  <span key={i} className="text-gray-500 dark:text-gray-400 whitespace-pre">{origLine}</span>
                ))}
                <span className="flex items-baseline gap-x-2">
                  <span className="text-gray-400">→</span>
                  <span className="text-indigo-600 dark:text-indigo-400 whitespace-pre">{d.proposed}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleApply} disabled={noneChecked}>
          Apply{selected.size < detections.length && selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      </div>
    </Modal>
  )
}
