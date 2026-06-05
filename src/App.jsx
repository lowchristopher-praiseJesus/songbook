import { useEffect, useRef, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { LicenseProvider } from './contexts/LicenseContext'
import { useLibraryStore } from './store/libraryStore'
import { ToastContainer } from './components/UI/Toast'
import { useToast } from './components/UI/useToast'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useDisplaySettings } from './hooks/useDisplaySettings'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainContent } from './components/SongList/MainContent'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { ImportConfirmModal } from './components/Share/ImportConfirmModal'
import { fetchShare } from './lib/shareApi'
import { fetchSessionState } from './lib/sessionApi'
import { parseSbpFile } from './lib/parser/sbpParser'
import { useSessionStore } from './store/sessionStore'
import { SessionView } from './components/Session/SessionView'
import { saveSessionHistory } from './lib/storage'
import { useConductorSync } from './hooks/useConductorSync'
import { useMetronome } from './hooks/useMetronome'
import { ConductorBar } from './components/Conductor/ConductorBar'
import { ConductorJoinModal } from './components/Conductor/ConductorJoinModal'
import { BroadcastWaitingBanner } from './components/Conductor/BroadcastWaitingBanner'
import { RecordingIndicator } from './components/Recorder/RecordingIndicator'

export default function App() {
  const init = useLibraryStore(s => s.init)
  const addSongs = useLibraryStore(state => state.addSongs)
  const setViewMode = useLibraryStore(state => state.setViewMode)
  const setExpandedCollectionId = useLibraryStore(state => state.setExpandedCollectionId)
  const selectSong = useLibraryStore(state => state.selectSong)
  const updateCollection = useLibraryStore(state => state.updateCollection)
  const collections = useLibraryStore(s => s.collections)
  const activeSong = useLibraryStore(s => s.activeSong)
  const index = useLibraryStore(s => s.index)
  const setIsCreatingNewAlbum = useLibraryStore(s => s.setIsCreatingNewAlbum)
  const { toasts, addToast } = useToast()
  const [activeSession, setActiveSession] = useState(null) // { code, leaderToken } | null
  const initClient = useSessionStore(s => s.initClient)
  const clearSession = useSessionStore(s => s.clearSession)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [autoClosingSidebar, setAutoClosingSidebar] = useState(false)
  const autoCloseTimerRef = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lyricsOnly, setLyricsOnly] = useLocalStorage('songsheet_lyrics_only', false)
  const [sessionLyricsOnly, setSessionLyricsOnly] = useState(false)
  const effectiveLyricsOnly = lyricsOnly || sessionLyricsOnly
  const [fontSize, setFontSize] = useLocalStorage('songsheet_font_size', 16)
  const [metronomeBpm, setMetronomeBpm] = useLocalStorage('songsheet_metronome_bpm', 120)
  const [metronomeEnabled, setMetronomeEnabled] = useLocalStorage('songsheet_metronome_enabled', false)
  const { isFlashing } = useMetronome(metronomeBpm, metronomeEnabled)
  const displaySettings = useDisplaySettings()
  const [shareSongs, setShareSongs] = useState(null)
  const directorTokenRef = useRef(null)
  const broadcastTimeRef = useRef(null)
  const [conductorTokenFromUrl, setConductorTokenFromUrl] = useState(null)
  const [broadcastTimeFromUrl, setBroadcastTimeFromUrl] = useState(null)

  useEffect(() => { init() }, [init])
  useEffect(() => () => clearTimeout(autoCloseTimerRef.current), [])

  // Listen for open-settings custom event (e.g. from ShareModal license prompt)
  useEffect(() => {
    function handleOpenSettings() { setSettingsOpen(true) }
    window.addEventListener('songsheet:openSettings', handleOpenSettings)
    return () => window.removeEventListener('songsheet:openSettings', handleOpenSettings)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    const sessionCode = params.get('session')
    if (sessionCode) {
      const leaderToken = params.get('token') || null
      initClient(sessionCode, leaderToken)
      setActiveSession({ code: sessionCode, leaderToken })
      const url = new URL(window.location.href)
      url.searchParams.delete('session')
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.toString())
      // Save to history once we have the session name from the server
      fetchSessionState(sessionCode)
        .then(data => saveSessionHistory({ code: sessionCode, leaderToken, name: data.name }))
        .catch(() => {})
      return
    }

    const shareCode = params.get('share')
    const directorToken = params.get('conductor_token') || params.get('director') || null
    directorTokenRef.current = directorToken
    setConductorTokenFromUrl(directorToken)
    const broadcastTimeVal = params.get('bt') || null
    broadcastTimeRef.current = broadcastTimeVal
    setBroadcastTimeFromUrl(broadcastTimeVal)
    if (!shareCode) return

    fetchShare(shareCode)
      .then(buf => parseSbpFile(buf))
      .then(parsed => setShareSongs({ ...parsed, shareCode }))
      .catch(err => {
        if (err.code === 'expired') {
          addToast('This share link has expired.', 'error')
        } else if (err.code === 'not_found') {
          addToast('Share link not found.', 'error')
        } else {
          addToast('Could not load shared songs.', 'error')
        }
        clearShareParam()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStartSession({ code, leaderToken, name }) {
    saveSessionHistory({ code, leaderToken, name })
    initClient(code, leaderToken)
    setActiveSession({ code, leaderToken })
  }

  function handleJoinSession({ code, name }) {
    saveSessionHistory({ code, leaderToken: null, name })
    initClient(code, null)
    setActiveSession({ code, leaderToken: null })
  }

  function clearShareParam() {
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    url.searchParams.delete('director')
    url.searchParams.delete('conductor_token')
    url.searchParams.delete('bt')
    window.history.replaceState({}, '', url.toString())
  }

  function handleShareImport() {
    if (shareSongs) {
      const name = shareSongs.collectionName || 'Shared Songs'
      const { newSongIds, collectionId } = addSongs(shareSongs.songs, name, null, shareSongs.shareCode, 1)
      const count = shareSongs.songs.length
      addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
      if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
      setSidebarOpen(true)
      if (window.innerWidth < 768) {
        setAutoClosingSidebar(true)
        autoCloseTimerRef.current = setTimeout(() => {
          setSidebarOpen(false)
          setAutoClosingSidebar(false)
        }, 2500)
      }
      if (newSongIds.length > 0) {
        setViewMode('collections')
        setExpandedCollectionId(collectionId)
        selectSong(newSongIds[0], collectionId)
      }
    }
    setShareSongs(null)
    clearShareParam()
  }

  const conductorCollection =
    collections.find(c => c.conductorCode && (c.conductorRole === 'conductor' || c.conductorRole === 'follower') && !c.conductorEnded) ??
    collections.find(c => c.conductorCode && !c.conductorEnded) ??
    null
  const conductorSync = useConductorSync({
    conductorCode: conductorCollection?.conductorCode ?? null,
    conductorToken: conductorCollection?.conductorDirectorToken ?? conductorCollection?.conductorToken ?? null,
    broadcastTime: conductorCollection?.conductorBroadcastTime ?? null,
    activeSongSbpId: activeSong?.meta?.sbpId ?? null,
    onAddToast: addToast,
  })

  const previewSongTitle = conductorSync.currentSbpId != null
    ? (index.find(e => e.sbpId === conductorSync.currentSbpId)?.title ?? null)
    : null

  function handleToggleLyricsOnly() {
    setSessionLyricsOnly(false)
    setLyricsOnly(!effectiveLyricsOnly)
  }

  function handleShareCancel() {
    setShareSongs(null)
    clearShareParam()
  }

  function handleShareGoToCollection(collectionId) {
    const collection = collections.find(c => c.id === collectionId)
    if (collection && collection.songIds.length > 0) {
      setViewMode('collections')
      setExpandedCollectionId(collectionId)
      selectSong(collection.songIds[0], collectionId)
    }
    setSidebarOpen(true)
    setShareSongs(null)
    clearShareParam()
  }

  function handleConductorShareImport(role) {
    if (!shareSongs) return
    const name = shareSongs.collectionName || 'Shared Songs'
    const { newSongIds, collectionId } = addSongs(shareSongs.songs, name)
    const count = shareSongs.songs.length
    addToast(`${count} song${count !== 1 ? 's' : ''} imported.`, 'success')
    if (shareSongs.lyricsOnly) setSessionLyricsOnly(true)
    if (role && collectionId && shareSongs.conductorCode) {
      const updates = {
        conductorCode: shareSongs.conductorCode,
        conductorRole: role,
      }
      if (conductorTokenFromUrl) {
        updates.conductorDirectorToken = conductorTokenFromUrl
        setConductorTokenFromUrl(null)
      }
      if (broadcastTimeFromUrl) {
        updates.conductorBroadcastTime = broadcastTimeFromUrl
        setBroadcastTimeFromUrl(null)
      }
      updateCollection(collectionId, updates)
    }
    setSidebarOpen(true)
    if (newSongIds.length > 0) {
      setViewMode('collections')
      setExpandedCollectionId(collectionId)
      selectSong(newSongIds[0], collectionId)
    }
    setShareSongs(null)
    clearShareParam()
  }

  function handleConductorRejoin() {
    const existing = collections.find(c => c.conductorCode === shareSongs?.conductorCode)
    if (existing && existing.songIds.length > 0) {
      setViewMode('collections')
      setExpandedCollectionId(existing.id)
      selectSong(existing.songIds[0])
    }
    setShareSongs(null)
    clearShareParam()
  }

  return (
    <ThemeProvider>
      <LicenseProvider>
      <div className="flex flex-col h-[100dvh] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top Nav */}
        <header className={`flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 transition-colors duration-75 ${isFlashing ? 'bg-red-500/40' : ''}`}>
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <span className="font-bold text-lg select-none">🎵 SongSheet</span>
            <RecordingIndicator />
          </div>
          <div className="flex items-center gap-1">
            {conductorCollection && <ConductorBar sync={conductorSync} />}
            <a
              href="/Documentation-songbook/user-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="User guide"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-base font-semibold leading-none"
            >
              ?
            </a>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xl"
            >
              ⚙️
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden relative">
          {activeSession ? (
            <SessionView
              code={activeSession.code}
              leaderToken={activeSession.leaderToken}
              onExit={() => {
                clearSession()
                setActiveSession(null)
              }}
              onAddToast={addToast}
            />
          ) : (
            <>
              {conductorCollection?.conductorRole === 'follower' &&
                ['dormant', 'waiting', 'ended'].includes(conductorSync.phase) && (
                <div className="absolute inset-x-0 top-0 z-10">
                  <BroadcastWaitingBanner
                    phase={conductorSync.phase}
                    broadcastTime={conductorCollection.conductorBroadcastTime ?? null}
                    collectionName={conductorCollection.name}
                    previewSongTitle={previewSongTitle}
                    onForget={() => {
                      useLibraryStore.getState().clearBroadcastFields(conductorCollection.id)
                    }}
                  />
                </div>
              )}
              <Sidebar
                isOpen={sidebarOpen}
                onAddToast={addToast}
                onClose={() => setSidebarOpen(false)}
                onSongSelect={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
                onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }}
                onNewAlbum={() => {
                  setIsCreatingNewAlbum(true)
                  if (window.innerWidth < 768) setSidebarOpen(false)
                }}
                onStartSession={handleStartSession}
                onJoinSession={handleJoinSession}
                conductorSync={conductorSync}
                isAutoClosing={autoClosingSidebar}
              />
              <MainContent onAddToast={addToast} lyricsOnly={effectiveLyricsOnly} fontSize={fontSize} onFontSizeChange={setFontSize} onImportSuccess={() => { if (window.innerWidth < 768) setSidebarOpen(true) }} onOpenSidebar={() => setSidebarOpen(true)} metronomeEnabled={metronomeEnabled} onMetronomeToggle={() => setMetronomeEnabled(e => !e)} metronomeBpm={metronomeBpm} onMetronomeBpmChange={setMetronomeBpm} />
            </>
          )}
        </div>
        <div id="turnstile-widget" style={{ display: 'none' }} />
      </div>
      <ToastContainer toasts={toasts} />
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          lyricsOnly={effectiveLyricsOnly}
          onToggleLyricsOnly={handleToggleLyricsOnly}
          displaySettings={displaySettings}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
        />
      )}
      {shareSongs?.conductorCode ? (
        <ConductorJoinModal
          isOpen={shareSongs !== null}
          shareSongs={shareSongs}
          conductorToken={conductorTokenFromUrl}
          broadcastTime={broadcastTimeFromUrl}
          onImport={(role) => handleConductorShareImport(role)}
          onRejoin={handleConductorRejoin}
          onCancel={handleShareCancel}
        />
      ) : (
        <ImportConfirmModal
          isOpen={shareSongs !== null}
          shareCode={shareSongs?.shareCode ?? null}
          songs={shareSongs?.songs ?? []}
          collectionName={shareSongs?.collectionName ?? null}
          lyricsOnly={shareSongs?.lyricsOnly ?? false}
          onImport={handleShareImport}
          onCancel={handleShareCancel}
          onGoToCollection={handleShareGoToCollection}
        />
      )}
      </LicenseProvider>
    </ThemeProvider>
  )
}
