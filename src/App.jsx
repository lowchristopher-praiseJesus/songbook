import { useEffect, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { useLibraryStore } from './store/libraryStore'
import { ToastContainer } from './components/UI/Toast'
import { useToast } from './components/UI/useToast'
import { useLocalStorage } from './hooks/useLocalStorage'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainContent } from './components/SongList/MainContent'
import { SettingsPanel } from './components/Settings/SettingsPanel'

export default function App() {
  const init = useLibraryStore(s => s.init)
  const { toasts, addToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lyricsOnly, setLyricsOnly] = useLocalStorage('songsheet_lyrics_only', false)
  const [fontSize, setFontSize] = useLocalStorage('songsheet_font_size', 16)

  useEffect(() => { init() }, [init])

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <span className="font-bold text-lg select-none">🎵 SongList</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xl"
          >
            ⚙️
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar
            isOpen={sidebarOpen}
            onAddToast={addToast}
            onClose={() => setSidebarOpen(false)}
            onSongSelect={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
          />
          <MainContent onAddToast={addToast} lyricsOnly={lyricsOnly} fontSize={fontSize} onFontSizeChange={setFontSize} />
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          lyricsOnly={lyricsOnly}
          onToggleLyricsOnly={() => setLyricsOnly(v => !v)}
        />
      )}
    </ThemeProvider>
  )
}
