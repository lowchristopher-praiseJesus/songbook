import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPresentationPdf } from '../../lib/exportPresentationPdf'

// Discover all images in src/assets/ at build time.
// Any new image added to that folder is automatically included on the next build.
const bgModules = import.meta.glob('../../assets/*.{png,jpg,jpeg,webp}', { eager: true })
const TEMPLATES = Object.entries(bgModules)
  .map(([path, mod]) => {
    const filename = path.split('/').pop()
    const stem = filename.replace(/\.[^.]+$/, '')
    // Produce a human-readable label: "Background" → "Default", "Background1" → "Template 1", etc.
    let label = stem
    if (stem === 'Background') label = 'Default'
    else if (/^Background\d+$/.test(stem)) label = `Template ${stem.replace('Background', '')}`
    return { id: stem, label, url: mod.default }
  })
  .sort((a, b) => {
    // Default first, then numerically
    if (a.id === 'Background') return -1
    if (b.id === 'Background') return 1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })

export function ExportBackgroundModal({ isOpen, songs, onClose, onAddToast }) {
  const [selectedId, setSelectedId] = useState(TEMPLATES[0]?.id ?? null)
  const [customUrl, setCustomUrl] = useState(null)   // set when user uploads a file
  const [bgImage, setBgImage] = useState(null)
  const [fontSizeStr, setFontSizeStr] = useState('20')
  const [maxCols, setMaxCols] = useState(2)

  const activeUrl = customUrl ?? TEMPLATES.find(t => t.id === selectedId)?.url ?? null

  // Load Image object whenever the active URL changes
  useEffect(() => {
    if (!isOpen || !activeUrl) return
    const img = new Image()
    img.onload = () => setBgImage(img)
    img.src = activeUrl
  }, [isOpen, activeUrl])

  // Reset to default when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedId(TEMPLATES[0]?.id ?? null)
      setCustomUrl(null)
    }
  }, [isOpen])

  function handleTemplateSelect(id) {
    setSelectedId(id)
    setCustomUrl(null)
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCustomUrl(ev.target.result)
      setSelectedId(null)
    }
    reader.readAsDataURL(file)
  }

  function handleExport() {
    try {
      const desiredFont = Math.min(32, Math.max(8, Number(fontSizeStr) || 20))
      exportPresentationPdf(songs, bgImage, { desiredFont, maxCols })
      onClose()
    } catch (err) {
      onAddToast('PDF export failed: ' + err.message, 'error')
    }
  }

  return (
    <Modal isOpen={isOpen} title="Presentation PDF" onClose={onClose}>
      <div className="space-y-4">

        {/* Template thumbnail grid */}
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
            Background template
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTemplateSelect(t.id)}
                className={`relative rounded overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500
                  ${selectedId === t.id
                    ? 'border-indigo-500'
                    : 'border-transparent hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
              >
                <img
                  src={t.url}
                  alt={t.label}
                  className="w-full object-cover"
                  style={{ aspectRatio: '16/9' }}
                />
                <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs py-0.5 text-center truncate px-1">
                  {t.label}
                </span>
                {selectedId === t.id && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs leading-none">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Large preview of selected / custom background */}
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">Preview</p>
          {activeUrl
            ? <img
                src={activeUrl}
                alt="Selected background"
                className="w-full rounded border border-gray-200 dark:border-gray-700"
                style={{ aspectRatio: '16/9', objectFit: 'cover' }}
              />
            : <div className="w-full rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 text-sm"
                style={{ aspectRatio: '16/9' }}>
                No background selected
              </div>
          }
        </div>

        {/* Settings row */}
        <div className="flex gap-4">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Font size</span>
            <input
              type="number"
              min={8}
              max={32}
              value={fontSizeStr}
              onChange={e => setFontSizeStr(e.target.value)}
              onBlur={e => {
                const clamped = Math.min(32, Math.max(8, Number(e.target.value) || 20))
                setFontSizeStr(String(clamped))
              }}
              className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Max columns</span>
            <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
              {[1, 2].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxCols(n)}
                  className={`px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500
                    ${maxCols === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom upload */}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Or upload a custom background
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 dark:text-gray-400"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!bgImage} onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>
    </Modal>
  )
}
