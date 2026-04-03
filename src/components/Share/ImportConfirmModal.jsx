import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';

export function ImportConfirmModal({ isOpen, songs, collectionName, onImport, onCancel }) {
  const displayName = collectionName || 'Shared Songs'
  return (
    <Modal isOpen={isOpen} title="Shared Songbook" onClose={onCancel}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {songs.length} song{songs.length !== 1 ? 's' : ''} shared with you:
      </p>
      <ul className="mb-4 max-h-48 overflow-y-auto space-y-1">
        {songs.map((song, i) => (
          <li key={i} className="text-sm text-gray-800 dark:text-gray-200">
            • {song.meta?.title ?? 'Untitled'}
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Will be added to collection: <span className="font-medium text-gray-700 dark:text-gray-300">{displayName}</span>
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onImport}>Import All</Button>
      </div>
    </Modal>
  );
}
