import { useState, useEffect, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { getFirecrawlKey } from '../../lib/storage'
import { searchUG } from '../../lib/ugImport/firecrawlClient'
import { fetchAndParseSong } from '../../lib/ugImport/fetchSong'
import { searchDanielChoy } from '../../lib/danielchoyImport/danielchoyClient'
import { searchCommunity, recordCommunityImport } from '../../lib/communityImport/communityClient'
import { insertIntoSet, displayTitle, findLibraryMatch } from '../../lib/addSongsToSet'
import { UGPreviewModal } from '../UGImport/UGPreviewModal'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'library', label: 'My library' },
  { id: 'community', label: 'Community' },
  { id: 'ug', label: 'Ultimate Guitar' },
  { id: 'danielchoy', label: 'Daniel Choy' },
]

const SOURCE_LABELS = { community: 'Community', ug: 'Ultimate Guitar', danielchoy: 'Daniel Choy' }

function errorMessage(err) {
  if (err?.message === 'UNAUTHORIZED') return 'Invalid API key — check Settings'
  if (err?.name === 'QuotaExceededError') return 'Storage full — delete some songs before importing'
  return 'Connection failed — check your internet and try again'
}

const btnBase = 'shrink-0 min-w-[6.5rem] h-9 px-3 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed'
const btnAdd = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60`
const btnAdded = `${btnBase} border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`
const btnInSet = `${btnBase} border border-gray-200 text-gray-500 dark:border-gray-600 dark:text-gray-400`

function SectionHeading({ children }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-2">
      {children}
    </h3>
  )
}

/**
 * One dialog for putting songs into a collection: library songs filter as you
 * type, and "Search online" looks in Community, Ultimate Guitar and Daniel Choy.
 * The dialog stays open so a whole set can be built in one visit.
 */
export function AddSongsModal({ isOpen, collectionId, collectionName, onClose, onAddToast = () => {} }) {
  const index = useLibraryStore(s => s.index)
  const collections = useLibraryStore(s => s.collections)
  const setCollectionSongs = useLibraryStore(s => s.setCollectionSongs)
  const addSongs = useLibraryStore(s => s.addSongs)

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [online, setOnline] = useState({ status: 'idle', results: [], ugSkipped: false })
  const [error, setError] = useState(null)
  const [addedIds, setAddedIds] = useState([])
  const [importedIds, setImportedIds] = useState([])
  const [busyKey, setBusyKey] = useState(null)
  const [previewResult, setPreviewResult] = useState(null)
  const [anchor, setAnchorState] = useState('end')
  const anchorRef = useRef('end')

  function setAnchor(value) {
    anchorRef.current = value
    setAnchorState(value)
  }

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setTab('all')
    setOnline({ status: 'idle', results: [], ugSkipped: false })
    setError(null)
    setAddedIds([])
    setImportedIds([])
    setBusyKey(null)
    setPreviewResult(null)
    setAnchor('end')
  }, [isOpen, collectionId])

  if (!isOpen) return null

  const songIds = collections.find(c => c.id === collectionId)?.songIds ?? []
  const titleById = Object.fromEntries(index.map(e => [e.id, e.title]))

  function currentSongIds() {
    return useLibraryStore.getState().collections.find(c => c.id === collectionId)?.songIds ?? []
  }

  function addById(id) {
    const result = insertIntoSet(currentSongIds(), id, anchorRef.current)
    setCollectionSongs(collectionId, result.songIds)
    setAnchor(result.anchor)
    setAddedIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }

  function undoAdd(id) {
    const ids = currentSongIds()
    const pos = ids.indexOf(id)
    if (anchorRef.current === id) setAnchor(pos > 0 ? ids[pos - 1] : 'start')
    setCollectionSongs(collectionId, ids.filter(x => x !== id))
    setAddedIds(prev => prev.filter(x => x !== id))
  }

  // The button for a song that is (or will be) a library song with this id.
  function libraryButton(id, title, addLabel = `Add ${title}`) {
    const pos = songIds.indexOf(id)
    if (pos >= 0 && addedIds.includes(id)) {
      return (
        <button type="button" className={btnAdded} aria-label={`Undo add ${title}`} onClick={() => undoAdd(id)}>
          Added · #{pos + 1}
        </button>
      )
    }
    if (pos >= 0) {
      return (
        <button type="button" className={btnInSet} aria-label={`${title} is in the set`} disabled>
          In set
        </button>
      )
    }
    return (
      <button type="button" className={btnAdd} aria-label={addLabel} onClick={() => addById(id)}>
        Add
      </button>
    )
  }

  async function importSong(song, result) {
    const source = result.source ?? 'ug'
    const idsBefore = new Set(useLibraryStore.getState().index.map(e => e.id))
    addSongs([song], SOURCE_LABELS[source], source)
    const entry = useLibraryStore.getState().index.find(e => !idsBefore.has(e.id))
    if (!entry) return
    setImportedIds(prev => [...prev, entry.id])
    addById(entry.id)
    // Fire-and-forget: the song is already in the library, so a failed counter must not surface.
    if (source === 'community') recordCommunityImport(result.id)
    onAddToast(`Imported: ${song.meta.title}`, 'success')
  }

  async function handleImport(result, key) {
    if (busyKey) return
    setBusyKey(key)
    setError(null)
    try {
      const song = await fetchAndParseSong(result, getFirecrawlKey())
      await importSong(song, result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    const apiKey = getFirecrawlKey()
    setOnline({ status: 'searching', results: [], ugSkipped: !apiKey })
    setError(null)
    const [cm, ug, dc] = await Promise.allSettled([
      searchCommunity(q),
      apiKey ? searchUG(q, apiKey) : Promise.resolve([]),
      searchDanielChoy(q, apiKey),
    ])
    const ok = o => (o.status === 'fulfilled' ? o.value : [])
    const results = [
      ...ok(cm).map(r => ({ ...r, source: 'community' })),
      ...ok(ug).map(r => ({ ...r, source: 'ug' })),
      ...ok(dc).map(r => ({ ...r, source: 'danielchoy' })),
    ]
    const searched = [cm, ...(apiKey ? [ug] : []), dc]
    if (searched.every(o => o.status === 'rejected')) setError(errorMessage(cm.reason))
    setOnline({ status: 'done', results, ugSkipped: !apiKey })
  }

  const trimmed = query.trim().toLowerCase()
  const librarySongs = [...index]
    .sort((a, b) => a.title.localeCompare(b.title))
    .filter(e => !trimmed
      || e.title.toLowerCase().includes(trimmed)
      || (e.artist ?? '').toLowerCase().includes(trimmed))

  const show = id => tab === 'all' || tab === id
  const onlineSources = ['community', 'ug', 'danielchoy']

  function renderOnlineRow(r) {
    const key = `${r.source}:${r.url ?? r.id}`
    const title = displayTitle(r.title) || r.title
    const sub = r.source === 'ug' ? r.description : r.artist
    const match = findLibraryMatch(index, r.title)
    const ownedBefore = match && !importedIds.includes(match.id)
    return (
      <li key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</span>
            {ownedBefore && (
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                In your library
              </span>
            )}
          </div>
          {sub && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{sub}</div>}
        </div>
        <Button
          variant="ghost"
          className="shrink-0 px-2"
          onClick={() => setPreviewResult(r)}
          aria-label={`Preview ${title}`}
          title="Preview"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Button>
        {match
          ? libraryButton(match.id, title, `Add ${title} (your library copy)`)
          : (
            <button
              type="button"
              className={btnAdd}
              aria-label={`Import and add ${title}`}
              disabled={!!busyKey}
              onClick={() => handleImport(r, key)}
            >
              {busyKey === key ? 'Adding…' : 'Import & add'}
            </button>
          )}
      </li>
    )
  }

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        Insert
        <select
          value={anchor}
          onChange={e => setAnchor(e.target.value)}
          className="h-9 px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 max-w-[14rem]"
        >
          <option value="end">at the end</option>
          <option value="start">at the start</option>
          {songIds.map(id => (
            <option key={id} value={id}>after “{titleById[id] ?? 'Untitled'}”</option>
          ))}
        </select>
      </label>
      <span className="flex-1" />
      <span className="text-sm text-gray-600 dark:text-gray-300">
        {addedIds.length === 0
          ? 'Nothing added yet'
          : `${addedIds.length} ${addedIds.length === 1 ? 'song' : 'songs'} added`}
      </span>
      <Button variant="primary" onClick={onClose}>Done</Button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} title={`Add songs to “${collectionName}”`} onClose={onClose} size="xl" footer={footer}>
      <form onSubmit={handleSearch} className="flex gap-2 mb-3">
        <input
          type="text"
          aria-label="Search library and online"
          placeholder="Song title or artist…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button type="submit" variant="secondary" disabled={!query.trim() || online.status === 'searching'}>
          Search online
        </Button>
      </form>

      <div role="tablist" aria-label="Sources" className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 mb-4">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <div className="space-y-5">
        {show('library') && (
          <section>
            <SectionHeading>In your library</SectionHeading>
            {librarySongs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No library songs match. Use <strong>Search online</strong> to look further.
              </p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {librarySongs.map(e => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{e.title}</div>
                      {e.artist && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{e.artist}</div>}
                    </div>
                    {libraryButton(e.id, e.title)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {online.status === 'idle' && tab !== 'library' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Press Enter or <strong>Search online</strong> to also look in Community, Ultimate Guitar and Daniel Choy.
          </p>
        )}

        {online.status === 'searching' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Searching online…</p>
        )}

        {online.status === 'done' && onlineSources.filter(show).map(source => {
          const rows = online.results.filter(r => r.source === source)
          return (
            <section key={source}>
              <SectionHeading>{SOURCE_LABELS[source]}</SectionHeading>
              {source === 'ug' && online.ugSkipped ? (
                <p className="text-sm px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  Skipped: Ultimate Guitar needs a Firecrawl API key. Add one in <strong>Settings</strong>.
                </p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No results</p>
              ) : (
                <ul className="space-y-1.5">{rows.map(renderOnlineRow)}</ul>
              )}
            </section>
          )
        })}
      </div>

      <UGPreviewModal
        result={previewResult}
        apiKey={getFirecrawlKey()}
        isOpen={!!previewResult}
        onClose={() => setPreviewResult(null)}
        onImported={async (song, result) => {
          await importSong(song, result)
          setPreviewResult(null)
        }}
      />
    </Modal>
  )
}
