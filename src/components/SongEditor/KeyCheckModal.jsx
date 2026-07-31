import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function KeyCheckModal({ isOpen, result, onUpdateKey, onCancel }) {
  if (!result) return null
  const { statedKey, detectedKey, keyMatches, outlierChords } = result

  return (
    <Modal isOpen={isOpen} title="Check Key" onClose={onCancel}>
      <div className="mb-4">
        {keyMatches ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Key matches — stated key <strong>{statedKey}</strong> fits the chords used.
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Stated key: <strong>{statedKey}</strong> · Detected key: <strong>{detectedKey}</strong>
              </p>
              <Button variant="primary" onClick={() => onUpdateKey(detectedKey)}>
                Update key
              </Button>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
              Your chords already match this key — choose "Keep As-Is" on the next step.
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          {outlierChords.length === 0
            ? 'No out-of-key chords found.'
            : `Chords outside the stated key (${statedKey}):`}
        </p>
        {outlierChords.length > 0 && (
          <ul className="max-h-60 overflow-y-auto space-y-1 mb-2">
            {outlierChords.map(o => (
              <li
                key={o.chord}
                className="text-sm font-mono flex items-baseline gap-2 px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/40"
              >
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{o.chord}</span>
                <span className="text-gray-400 text-xs">
                  {o.count > 1 ? `${o.count}× · ` : ''}e.g. line {o.exampleLine + 1}: {o.exampleText.trim()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onCancel}>Close</Button>
      </div>
    </Modal>
  )
}
