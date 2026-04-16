import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

/**
 * Shown when the editor's lock has expired while they were editing.
 *
 * Props:
 *   hadConflict  — boolean: did someone else save changes while lock was gone?
 *   theirRawText — the version saved by the other person (only when hadConflict=true)
 *   myRawText    — the editor's unsaved local changes
 *   onRelock     — called when user chooses to re-acquire lock and save their version
 *   onKeepTheirs — called when user chooses to discard their edits and keep the other version
 *   onDiscard    — called when user discards all changes (no-conflict path or cancel)
 */
export function EditLockWarning({ hadConflict, theirRawText, myRawText, onRelock, onKeepTheirs, onDiscard }) {
  return (
    <Modal isOpen title="Edit lock expired" onClose={onDiscard}>
      {hadConflict ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Your edit lock expired and someone else saved changes to this song. Review and choose which version to keep.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Their version</p>
              <pre className="bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">{theirRawText}</pre>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-500 mb-1 uppercase tracking-wide">Your version</p>
              <pre className="bg-indigo-50 dark:bg-indigo-900/30 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">{myRawText}</pre>
            </div>
          </div>

          <div className="flex gap-2 justify-end flex-wrap">
            <Button variant="ghost" onClick={onDiscard}>Cancel</Button>
            <Button variant="secondary" onClick={onKeepTheirs}>Keep their version</Button>
            <Button variant="primary" onClick={onRelock}>Keep my version</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Your edit lock expired, but no one else changed this song. You can still save your edits.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onDiscard}>Discard</Button>
            <Button variant="primary" onClick={onRelock}>Re-lock &amp; Save</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
