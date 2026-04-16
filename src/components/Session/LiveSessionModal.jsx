import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { createSession, fetchSessionState } from '../../lib/sessionApi'
import { loadSessionHistory, removeSessionFromHistory } from '../../lib/storage'

const inputClass = `w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
  focus:outline-none focus:ring-2 focus:ring-indigo-500`

function defaultName() {
  return `Sunday ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
}

function formatDate(isoString) {
  const d = new Date(isoString)
  const diff = Math.floor((Date.now() - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function LiveSessionModal({ isOpen, onClose, onStartSession, onJoinSession }) {
  const [sessionName, setSessionName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null) // { field: 'start' | 'join', message }
  const [sessions, setSessions] = useState([])
  const [validating, setValidating] = useState(false)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [copiedCode, setCopiedCode] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const history = loadSessionHistory()
    if (history.length === 0) {
      setSessions([])
      return
    }
    setValidating(true)
    Promise.allSettled(
      history.map(entry =>
        fetchSessionState(entry.code).then(data => ({ ...entry, name: data.name, closed: data.closed, expiresAt: data.expiresAt }))
      )
    ).then(results => {
      const live = []
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && !result.value.closed) {
          live.push(result.value)
        } else {
          removeSessionFromHistory(history[i].code)
        }
      })
      setSessions(live)
      setValidating(false)
    })
  }, [isOpen])

  function handleClose() {
    setSessionName('')
    setJoinCode('')
    setLoading(false)
    setError(null)
    setShowCodeInput(false)
    setSessions([])
    setValidating(false)
    setCopiedCode(null)
    onClose()
  }

  function copyMemberLink(code) {
    const url = new URL(window.location.href)
    url.searchParams.set('session', code)
    url.searchParams.delete('token')
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(c => c === code ? null : c), 2000)
    })
  }

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const name = sessionName.trim() || defaultName()
      const data = await createSession({ name, songs: [] })
      handleClose()
      onStartSession({ code: data.code, leaderToken: data.leaderToken, name })
    } catch {
      setError({ field: 'start', message: 'Could not create session. Check your connection.' })
    } finally {
      setLoading(false)
    }
  }

  function handleRejoin(session) {
    handleClose()
    if (session.leaderToken) {
      onStartSession({ code: session.code, leaderToken: session.leaderToken, name: session.name })
    } else {
      onJoinSession({ code: session.code, name: session.name })
    }
  }

  async function handleJoinByCode() {
    const code = joinCode.trim().toUpperCase()
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSessionState(code)
      handleClose()
      onJoinSession({ code, name: data.name })
    } catch (err) {
      if (err.code === 'expired') {
        setError({ field: 'join', message: 'This session has already ended.' })
      } else if (err.code === 'not_found') {
        setError({ field: 'join', message: 'Session not found.' })
      } else {
        setError({ field: 'join', message: 'Could not connect. Check your connection.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title="Live Session" onClose={handleClose}>
      <div className="flex flex-col gap-4">

        {/* Recent sessions */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            Recent Sessions
          </p>
          {validating ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Checking sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No active sessions.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 -mx-1 mb-1">
              {sessions.map(session => (
                <li key={session.code} className="flex items-center gap-1 px-1 py-1">
                  <button
                    onClick={() => handleRejoin(session)}
                    className="flex-1 flex items-center gap-3 px-2 py-1 rounded-lg
                      hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {session.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                        <span>{session.leaderToken ? 'Leader' : 'Member'} &middot; {formatDate(session.joinedAt)}</span>
                        {session.expiresAt && (() => {
                          const daysLeft = Math.ceil((new Date(session.expiresAt) - Date.now()) / 86400000)
                          const urgent = daysLeft <= 3
                          const soon = daysLeft <= 7
                          return (
                            <span className={`px-1 py-0.5 rounded text-xs
                              ${urgent ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold'
                              : soon   ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                       : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}
                            >
                              Expires in {daysLeft}d
                            </span>
                          )
                        })()}
                      </p>
                    </div>
                    <span className="text-indigo-500 dark:text-indigo-400 text-sm shrink-0">Enter &rarr;</span>
                  </button>
                  <button
                    onClick={() => copyMemberLink(session.code)}
                    title="Copy member link"
                    className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  >
                    {copiedCode === session.code ? '✓' : '🔗'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          or
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Start section */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Start a new session</p>
          <input
            type="text"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) handleCreate() }}
            placeholder={`Session name (e.g. ${defaultName()})`}
            autoFocus
            className={inputClass}
          />
          {error?.field === 'start' && (
            <p className="text-sm text-red-500 mt-1">{error.message}</p>
          )}
          <Button
            variant="primary"
            className="w-full mt-2"
            onClick={handleCreate}
            disabled={loading}
          >
            Create &amp; Enter &rarr;
          </Button>
        </div>

        {/* Join by code (secondary fallback) */}
        <div>
          <button
            onClick={() => setShowCodeInput(v => !v)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 underline underline-offset-2"
          >
            Join with a different code {showCodeInput ? '▴' : '▾'}
          </button>
          {showCodeInput && (
            <div className="mt-2">
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim().length === 6 && !loading) handleJoinByCode() }}
                placeholder="ABC123"
                maxLength={6}
                className={`${inputClass} font-mono tracking-widest`}
              />
              {error?.field === 'join' && (
                <p className="text-sm text-red-500 mt-1">{error.message}</p>
              )}
              <Button
                variant="secondary"
                className="w-full mt-2"
                onClick={handleJoinByCode}
                disabled={loading || joinCode.trim().length < 6}
              >
                Join &rarr;
              </Button>
            </div>
          )}
        </div>

      </div>
    </Modal>
  )
}
