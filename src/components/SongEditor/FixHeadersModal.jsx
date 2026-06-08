import { Modal } from '../UI/Modal'

export function FixHeadersModal({ isOpen, detections, onApply, onCancel }) {
  return (
    <Modal isOpen={isOpen} title="Convert Section Headers" onClose={onCancel}>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
        {detections.length} line{detections.length !== 1 ? 's' : ''} will be
        converted to section header syntax:
      </p>
      <ul className="space-y-2 mb-5 max-h-60 overflow-y-auto">
        {detections.map((d, idx) => (
          <li key={idx} className="text-sm font-mono flex flex-wrap items-baseline gap-x-2">
            <span className="text-gray-500 dark:text-gray-400">{d.original.trim()}</span>
            <span className="text-gray-400">→</span>
            <span className="text-indigo-600 dark:text-indigo-400">{d.proposed}</span>
            {d.confidence === 'low' && (
              <span className="text-xs text-amber-500 font-sans">(possible typo)</span>
            )}
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
          onClick={onApply}
          className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg
                     hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Apply All
        </button>
      </div>
    </Modal>
  )
}
