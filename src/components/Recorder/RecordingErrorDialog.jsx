import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function RecordingErrorDialog({ isOpen, message, onClose }) {
  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} title="Microphone Access Needed" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {message}
        </p>
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          On mobile, this is usually in the browser site settings or the device privacy settings for the browser app.
        </div>
        <div className="flex justify-end">
          <Button variant="primary" type="button" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Modal>
  )
}
