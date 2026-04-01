import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';

export function ImportConfirmModal({ isOpen, songs, onImport, onCancel }) {
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
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onImport}>Import All</Button>
      </div>
    </Modal>
  );
}
