import { useState } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

function displayValue(field, value) {
  if (field.key === 'rawText') return String(value).slice(0, 80) + (String(value).length > 80 ? '…' : '')
  if (field.key === 'capo') return value ? `Capo ${value}` : 'No capo'
  if (field.key === 'tempo') return value ? `${value} BPM` : '—'
  return String(value ?? '—')
}

export function ConflictPickerModal({ conflicts, onApply, onCancel }) {
  const [choices, setChoices] = useState(new Map())

  const totalFields = conflicts.reduce((n, c) => n + c.fields.length, 0)
  const resolved = totalFields > 0 && choices.size >= totalFields

  function pick(localId, fieldKey, side) {
    setChoices(prev => new Map(prev).set(`${localId}:${fieldKey}`, side))
  }

  function handleApply() {
    const resolvedPatches = conflicts.map(conflict => {
      const metaUpdates = { ...conflict._autoMetaUpdates }
      let rawText = conflict._autoRawText

      for (const field of conflict.fields) {
        const choice = choices.get(`${conflict.localId}:${field.key}`)
        const value = choice === 'theirs' ? field.theirs : field.mine
        if (field.key === 'rawText') rawText = value
        else metaUpdates[field.key] = value
      }

      return {
        localId:     conflict.localId,
        metaUpdates,
        rawText,
        newBaseline: conflict._newBaseline,
      }
    })
    onApply(resolvedPatches)
  }

  return (
    <Modal isOpen title="Update conflicts" onClose={onCancel}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        You edited some songs that were also updated by the sharer. Choose which version to keep.
      </p>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {conflicts.map(conflict => (
          <div key={conflict.localId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-semibold border-b border-gray-200 dark:border-gray-700">
              {conflict.songTitle}
            </div>
            <div className="p-3 space-y-3">
              {conflict.fields.map(field => {
                const choice = choices.get(`${conflict.localId}:${field.key}`)
                return (
                  <div key={field.key}>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{field.label}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-label="Keep mine"
                        onClick={() => pick(conflict.localId, field.key, 'mine')}
                        className={`flex-1 min-w-0 text-left p-2 rounded border text-sm transition-colors ${
                          choice === 'mine'
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-xs font-semibold text-gray-500 mb-1">Keep mine</div>
                        <div className="font-mono text-xs truncate">
                          {field.mineDisplay ?? displayValue(field, field.mine)}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label="Use theirs"
                        onClick={() => pick(conflict.localId, field.key, 'theirs')}
                        className={`flex-1 min-w-0 text-left p-2 rounded border text-sm transition-colors ${
                          choice === 'theirs'
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-xs font-semibold text-gray-500 mb-1">Use theirs</div>
                        <div className="font-mono text-xs truncate">
                          {field.theirsDisplay ?? displayValue(field, field.theirs)}
                        </div>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3 mb-4">
        All other changes (no conflict) will be applied automatically.
      </p>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleApply} disabled={!resolved}>
          Apply ({choices.size}/{totalFields} resolved)
        </Button>
      </div>
    </Modal>
  )
}
