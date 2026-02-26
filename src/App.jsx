import { useEffect, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { useLibraryStore } from './store/libraryStore'
import { ToastContainer } from './components/UI/Toast'
import { useToast } from './components/UI/useToast'

// Placeholders — replaced by real components in Tasks 10 and 11
function SidebarPlaceholder({ isOpen }) {
  if (!isOpen) return null
  return (
    <aside className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 shrink-0">
      <p className="text-sm text-gray-500">Library sidebar (Task 10)</p>
    </aside>
  )
}

function MainContentPlaceholder() {
  return (
    <main className="flex-1 flex items-center justify-center text-gray-400">
      <p>Song content area (Task 11)</p>
    </main>
  )
}

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
            onClick={() => setSettingsOpen(o => !o)}
            aria-label="Settings"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xl"
          >
            ⚙️
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          <SidebarPlaceholder isOpen={sidebarOpen} />
          <MainContentPlaceholder />
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <p className="text-sm">Settings (Task 13)</p>
            <button onClick={() => setSettingsOpen(false)} className="mt-4 text-indigo-600 underline text-sm">Close</button>
          </div>
        </div>
      )}
    </ThemeProvider>
  )
}
