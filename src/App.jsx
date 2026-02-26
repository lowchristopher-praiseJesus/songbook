import { useEffect, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { useLibraryStore } from './store/libraryStore'
import { ToastContainer } from './components/UI/Toast'
import { useToast } from './components/UI/useToast'
import { Sidebar } from './components/Sidebar/Sidebar'
import { MainContent } from './components/SongSheet/MainContent'
import { SettingsPanel } from './components/Settings/SettingsPanel'

export default function App() {
  const init = useLibraryStore(s => s.init)
  const { toasts, addToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
            <span className="font-bold text-lg select-none">🎵 SongSheet</span>
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
        <div className="flex flex-1 overflow-hidden">
          <Sidebar isOpen={sidebarOpen} onAddToast={addToast} />
          <MainContent onAddToast={addToast} />
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </ThemeProvider>
  )
}
