import { useState, useEffect } from 'react'
import { Modal }  from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPresentationPptx } from '../../lib/exportPresentationPptx'

const bgModules = import.meta.glob('../../assets/*.{png,jpg,jpeg,webp}', { eager: true })
const TEMPLATES = Object.entries(bgModules)
  .map(([path, mod]) => {
    const filename = path.split('/').pop()
    const stem     = filename.replace(/\.[^.]+$/, '')
    let label = stem
    if (stem === 'Background')            label = 'Default'
    else if (/^Background\d+$/.test(stem)) label = `Template ${stem.replace('Background', '')}`
    return { id: stem, label, url: mod.default }
  })
  .sort((a, b) => {
    if (a.id === 'Background') return -1
    if (b.id === 'Background') return 1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })

export function ExportPresentationPptxModal({ isOpen, songs, onClose, onAddToast }) {
  const [selectedId,    setSelectedId]    = useState(TEMPLATES[0]?.id ?? null)
  const [customUrl,     setCustomUrl]     = useState(null)
  const [bgImage,       setBgImage]       = useState(null)
  const slideMode = 'section'
  const [fontSizeStr,   setFontSizeStr]   = useState('24')
  const [titlePosition, setTitlePosition] = useState('top')
  const [showChords,    setShowChords]    = useState(false)
  const [exporting,     setExporting]     = useState(false)

  const activeUrl = customUrl ?? TEMPLATES.find(t => t.id === selectedId)?.url ?? null

  useEffect(() => {
    if (!isOpen || !activeUrl) return
    const img   = new Image()
    img.onload  = () => setBgImage(img)
    img.src     = activeUrl
  }, [isOpen, activeUrl])

  useEffect(() => {
    if (isOpen) { setSelectedId(TEMPLATES[0]?.id ?? null); setCustomUrl(null) }
  }, [isOpen])

  function handleTemplateSelect(id) { setSelectedId(id); setCustomUrl(null) }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader   = new FileReader()
    reader.onload  = ev => { setCustomUrl(ev.target.result); setSelectedId(null) }
    reader.readAsDataURL(file)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const fontSize = Math.min(48, Math.max(12, Number(fontSizeStr) || 24))
      let annotationsVisible = true
      try {
        const raw = localStorage.getItem('songsheet_annotations_visible')
        if (raw !== null) annotationsVisible = JSON.parse(raw)
      } catch { /* keep default */ }
      await exportPresentationPptx(songs, bgImage, {
        slideMode, fontSize, titlePosition, showChords, annotationsVisible,
      })
      onClose()
    } catch (err) {
      onAddToast('PPTX export failed: ' + err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const toggleBtn = active =>
    `px-3 py-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
    }`

  return (
    <Modal isOpen={isOpen} title="Presentation PPTX" onClose={onClose}>
      <div className="space-y-3 sm:space-y-4">

        {/* Background template picker */}
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Background template</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 sm:max-h-64 overflow-y-auto pr-1">
            {TEMPLATES.map(t => (
              <button
                key={t.id} type="button" onClick={() => handleTemplateSelect(t.id)}
                className={`relative rounded overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500
                  ${selectedId === t.id ? 'border-indigo-500' : 'border-transparent hover:border-gray-400 dark:hover:border-gray-500'}`}
              >
                <img src={t.url} alt={t.label} className="w-full object-cover" style={{ aspectRatio: '16/9' }} />
                <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs py-0.5 text-center truncate px-1">
                  {t.label}
                </span>
                {selectedId === t.id && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs leading-none">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Song title position */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Song title</p>
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
            {[
              { value: 'top',          label: 'Top' },
              { value: 'bottom-left',  label: 'Bottom Left' },
              { value: 'bottom-right', label: 'Bottom Right' },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setTitlePosition(value)} className={toggleBtn(titlePosition === value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Font size</span>
            <input
              type="number" min={12} max={48} value={fontSizeStr}
              onChange={e => setFontSizeStr(e.target.value)}
              onBlur={e => setFontSizeStr(String(Math.min(48, Math.max(12, Number(e.target.value) || 24))))}
              className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Font size is a starting point — PowerPoint and Keynote auto-fit text to each slide.
          </p>
        </div>

        {/* Show chords */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={showChords} onChange={e => setShowChords(e.target.checked)}
            className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show chords</span>
        </label>

        {/* Custom background upload */}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Or upload a custom background</label>
          <input type="file" accept="image/*" onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 dark:text-gray-400" />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button variant="primary" disabled={!bgImage || exporting} onClick={handleExport}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
