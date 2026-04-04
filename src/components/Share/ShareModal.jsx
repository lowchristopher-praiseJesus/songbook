import { useState, useEffect } from 'react';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import { uploadShare } from '../../lib/shareApi';
import { exportSongsAsSbp } from '../../lib/exportSbp';

export function ShareModal({ isOpen, songs, collectionName, onClose }) {
  const [step, setStep] = useState('idle');
  const [nameValue, setNameValue] = useState(collectionName ?? '');
  const [shareLyricsOnly, setShareLyricsOnly] = useState(false);

  // Sync nameValue from prop each time the modal opens (useState initial value
  // is only evaluated once on mount, so prop changes after mount are ignored).
  useEffect(() => {
    if (isOpen) setNameValue(collectionName ?? '')
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCreateLink() {
    setStep('uploading');
    try {
      const blob = await exportSongsAsSbp(songs, nameValue.trim() || null, shareLyricsOnly);
      const result = await uploadShare(blob, expiresInDays);
      setShareUrl(result.shareUrl);
      setExpiresAt(result.expiresAt);
      setStep('done');
    } catch {
      setStep('error');
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can manually copy the URL
    }
  }

  function handleClose() {
    setStep('idle');
    setNameValue(collectionName ?? '');
    setExpiresInDays(7);
    setShareUrl('');
    setCopied(false);
    setShareLyricsOnly(false);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} title="Share via link" onClose={handleClose}>
      {step === 'idle' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {songs.length} song{songs.length !== 1 ? 's' : ''} will be shared.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Collection name <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="e.g. Easter Set"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Link expires in
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} day{d !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              role="switch"
              aria-checked={shareLyricsOnly}
              aria-label="Share lyrics only"
              onClick={() => setShareLyricsOnly(v => !v)}
              className="flex items-center gap-3 w-full text-left"
            >
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200
                ${shareLyricsOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200
                  ${shareLyricsOnly ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">Share lyrics only</span>
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateLink}>Create link</Button>
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Uploading…</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Link expires {new Date(expiresAt).toLocaleDateString()}.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            />
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Upload failed. Please check your connection and try again.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStep('idle')}>Retry</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
