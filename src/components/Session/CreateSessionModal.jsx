import { useState } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { createSession } from '../../lib/sessionApi'
import { loadSong } from '../../lib/storage'

export function CreateSessionModal({ isOpen, selectedSongIds, onClose, onCreated }) {
  const [step, setStep] = useState('name') // 'name' | 'links'
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { code, leaderToken, memberUrl, leaderUrl }
  const [copied, setCopied] = useState(null) // 'member' | 'leader' | null

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const songs = [...selectedSongIds]
        .map(id => loadSong(id))
        .filter(Boolean)
        .map(s => ({ id: s.id, meta: s.meta, rawText: s.rawText ?? '' }))

      const data = await createSession({ name: name.trim(), songs })
      setResult(data)
      setStep('links')
      onCreated?.(data)
    } catch {
      setError('Could not create session. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function handleClose() {
    setStep('name')
    setName('')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} title="Start Live Session" onClose={handleClose}>
      {step === 'name' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Create a session your team can join to edit the set list together.
            {selectedSongIds?.size > 0 && (
              <span> {selectedSongIds.size} song{selectedSongIds.size !== 1 ? 's' : ''} will be added.</span>
            )}
          </p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder={`Session name (e.g. Sunday ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})`}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating\u2026' : 'Create Session'}
            </Button>
          </div>
        </div>
      )}

      {step === 'links' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              Live
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">Session created</span>
          </div>

          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">MEMBER LINK &mdash; share with your team</p>
            <p className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all mb-2">{result.memberUrl}</p>
            <Button variant="secondary" className="text-xs py-1 px-3" onClick={() => copyToClipboard(result.memberUrl, 'member')}>
              {copied === 'member' ? '\u2713 Copied!' : '\uD83D\uDCCB Copy link'}
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">YOUR LEADER LINK &mdash; keep private</p>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all mb-2">{result.leaderUrl}</p>
            <Button variant="secondary" className="text-xs py-1 px-3" onClick={() => copyToClipboard(result.leaderUrl, 'leader')}>
              {copied === 'leader' ? '\u2713 Copied!' : '\uD83D\uDCCB Copy link'}
            </Button>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleClose}>Close</Button>
            <Button variant="primary" onClick={() => { window.location.href = result.leaderUrl }}>Open Session &rarr;</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
