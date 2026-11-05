import { useState, useRef, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { getThemePickQuota, requestThemePicks, withTimeout } from '../../lib/themePickApi'
import { createCollectionFromPicks } from '../../lib/createCollectionFromPicks'
import useTurnstile from '../../hooks/useTurnstile'
import { ThemePickReview } from './ThemePickReview'

const DEFAULT_COUNT = 10
const MIN_COUNT = 1
const MAX_COUNT = 20
const MAX_EXCLUDE = 100
const PER_DAY = 5
const TURNSTILE_TIMEOUT_MS = 20000

function clampCount(text) {
  const n = parseInt(String(text).trim(), 10)
  if (Number.isNaN(n)) return DEFAULT_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n))
}

function resetTime(resetsAt) {
  if (!resetsAt) return 'midnight UTC'
  return new Date(resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const ERROR_MESSAGES = {
  picker_unavailable: 'The song picker is asleep — try again in a minute',
  picker_bad_output: 'The song picker couldn’t come up with a list — try again',
  global_limit: 'The song picker is busy today — try again tomorrow',
  turnstile_failed: 'Couldn’t verify you’re human — please try again',
  invalid_input: 'Please check the theme and number of songs',
  network_error: 'Connection failed — check your internet and try again',
}

export function NewCollectionCreator({ onOpenSidebar, onAddToast }) {
  const createCollection = useLibraryStore(s => s.createCollection)
  const setSelectedCollectionId = useLibraryStore(s => s.setSelectedCollectionId)
  const setIsCreatingNewCollection = useLibraryStore(s => s.setIsCreatingNewCollection)
  const { getToken } = useTurnstile()

  const [draft, setDraft] = useState('')
  const [theme, setTheme] = useState('')
  const [countText, setCountText] = useState(String(DEFAULT_COUNT))
  const [quota, setQuota] = useState(null)       // { remaining, resetsAt } or null when unknown
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState(null)     // { theme, count, picks, shownIds }
  const inputRef = useRef(null)
  const busyRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    getThemePickQuota().then(q => { if (aliveRef.current && q) setQuota(q) })
    return () => { aliveRef.current = false }
  }, [])

  const hasTheme = theme.trim().length > 0
  const remaining = quota?.remaining ?? PER_DAY
  const exhausted = quota !== null && remaining <= 0

  function close() {
    aliveRef.current = false
    setIsCreatingNewCollection(false)
  }

  function handleCreate() {
    const trimmed = draft.trim()
    if (!trimmed) return
    const newId = createCollection(trimmed)
    if (newId) setSelectedCollectionId(newId)
    close()
  }

  function handleCancel() {
    if (adding) return
    close()
    if (window.innerWidth < 768) onOpenSidebar?.()
  }

  async function fetchPicks(pickTheme, count, exclude) {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    setError('')
    try {
      const turnstileToken = await withTimeout(getToken(), TURNSTILE_TIMEOUT_MS, 'turnstile_failed')
      const { picks, remaining: left } = await requestThemePicks({ theme: pickTheme, count, exclude, turnstileToken })
      if (!aliveRef.current) return
      setQuota(q => ({ ...(q ?? {}), remaining: left }))
      setReview(prev => ({
        theme: pickTheme,
        count,
        picks,
        shownIds: [...(prev?.shownIds ?? []), ...picks.map(p => p.id)],
      }))
    } catch (e) {
      if (!aliveRef.current) return
      if (e?.code === 'daily_limit') {
        setQuota(q => ({ ...(q ?? {}), remaining: 0, resetsAt: e.resetsAt ?? q?.resetsAt }))
      } else {
        setError(ERROR_MESSAGES[e?.code] ?? ERROR_MESSAGES.network_error)
      }
    } finally {
      busyRef.current = false
      if (aliveRef.current) setLoading(false)
    }
  }

  function handlePick() {
    if (busyRef.current || review || !draft.trim() || !hasTheme || exhausted) return
    const count = clampCount(countText)
    setCountText(String(count))
    setReview(null)
    fetchPicks(theme.trim(), count, [])
  }

  function handleRegenerate() {
    if (!review) return
    fetchPicks(review.theme, review.count, review.shownIds.slice(-MAX_EXCLUDE))
  }

  async function handleAdd(selected) {
    if (busyRef.current) return
    if (!draft.trim()) return
    busyRef.current = true
    setLoading(true)
    setAdding(true)
    setError('')
    try {
      const { collectionId, failedTitles } = await createCollectionFromPicks(draft.trim(), selected)
      if (!collectionId) {
        setError('Couldn’t download any of the songs — check your connection and try again')
        return
      }
      setSelectedCollectionId(collectionId)
      const added = selected.length - failedTitles.length
      onAddToast?.(`Created “${draft.trim()}” with ${added} song${added === 1 ? '' : 's'}`, 'success')
      if (failedTitles.length) onAddToast?.(`Couldn’t add: ${failedTitles.join(', ')}`, 'error')
      close()
    } finally {
      busyRef.current = false
      setAdding(false)
      if (aliveRef.current) setLoading(false)
    }
  }

  const disabledBtnClass = `w-full py-2.5 rounded-lg border border-gray-200 dark:border-gray-700
    text-gray-400 dark:text-gray-600 text-sm font-medium cursor-not-allowed opacity-50`
  const fieldClass = `px-3 py-2 text-[16px] rounded-lg border border-gray-300 dark:border-gray-600
    bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500`

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={handleCancel}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          New Collection
        </h1>

        {/* Name input */}
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (review || busyRef.current) return
              hasTheme ? handlePick() : handleCreate()
            }
            if (e.key === 'Escape') handleCancel()
          }}
          placeholder="Collection name…"
          className="w-full px-3 py-2 text-[16px] rounded-lg border border-indigo-400
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        {/* Theme picker fields */}
        <label htmlFor="ncc-theme" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Theme (optional)
        </label>
        <input
          id="ncc-theme"
          type="text"
          value={theme}
          maxLength={200}
          onChange={e => setTheme(e.target.value)}
          placeholder="e.g. Let us glorify God"
          className={`w-full mb-3 ${fieldClass}`}
        />
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="ncc-count" className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Songs
          </label>
          <input
            id="ncc-count"
            type="text"
            inputMode="numeric"
            value={countText}
            onChange={e => setCountText(e.target.value)}
            onBlur={() => setCountText(String(clampCount(countText)))}
            className={`w-16 ${fieldClass}`}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {exhausted
              ? `No picks left today — resets at ${resetTime(quota?.resetsAt)}`
              : quota ? `${remaining} of ${PER_DAY} picks left today` : ''}
          </span>
        </div>

        {/* Create / Cancel */}
        <div className="flex gap-2">
          {hasTheme ? (
            <>
              <button
                type="button"
                onClick={handlePick}
                disabled={!draft.trim() || exhausted || loading}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700
                  text-white text-sm font-semibold transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✨ Create &amp; pick songs
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!draft.trim() || loading}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                  text-gray-700 dark:text-gray-300 text-sm font-medium
                  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create empty
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={!draft.trim()}
              className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700
                text-white text-sm font-semibold transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create
            </button>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={adding}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-600 dark:text-gray-400 text-sm font-medium
              hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>

        {loading && (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400" role="status">
            Picking songs… this can take up to a minute.
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
        )}
      </div>

      {review ? (
        <ThemePickReview
          theme={review.theme}
          picks={review.picks}
          remaining={remaining}
          loading={loading}
          addDisabled={!draft.trim()}
          onAdd={handleAdd}
          onRegenerate={handleRegenerate}
          onCancel={() => setReview(null)}
        />
      ) : (
        /* Disabled action buttons */
        <div className="mb-8 space-y-2">
          <button type="button" disabled className={disabledBtnClass}>Add Songs</button>
          <button type="button" disabled className={disabledBtnClass}>Rename</button>
          <button type="button" disabled className={disabledBtnClass}>Duplicate</button>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <button
              type="button"
              disabled
              className={`w-full py-2.5 rounded-lg border border-red-200 dark:border-red-900
                text-red-400 dark:text-red-700 text-sm font-medium cursor-not-allowed opacity-50`}
            >
              Delete Collection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
