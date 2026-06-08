import { Modal } from '../UI/Modal'

export function TransposeConfirmModal({ isOpen, fromKey, toKey, onTranspose, onKeepAsIs }) {
  return (
    <Modal isOpen={isOpen} title="Change Key" onClose={onKeepAsIs}>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">
        You're changing the key from <strong>{fromKey}</strong> to <strong>{toKey}</strong>.
        Do you want to transpose the chords in the song to match?
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onKeepAsIs}
          className="text-sm px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          Keep As-Is
        </button>
        <button
          type="button"
          onClick={onTranspose}
          className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg
                     hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Transpose Chords
        </button>
      </div>
    </Modal>
  )
}
