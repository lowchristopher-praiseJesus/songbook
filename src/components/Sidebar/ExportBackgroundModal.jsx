import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPresentationPdf } from '../../lib/exportPresentationPdf'
import defaultBgUrl from '../../assets/Background.png'

export function ExportBackgroundModal({ isOpen, songs, onClose, onAddToast }) {
  const [previewUrl, setPreviewUrl] = useState(defaultBgUrl)
  const [bgImage, setBgImage] = useState(null)
  const [fontSize, setFontSize] = useState(20)
  const [maxCols, setMaxCols] = useState(2)

  useEffect(() => {
    if (!isOpen) return
    const img = new Image()
    img.onload = () => setBgImage(img)
    img.src = defaultBgUrl
  }, [isOpen])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target.result
      setPreviewUrl(url)
      const img = new Image()
      img.onload = () => setBgImage(img)
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  function handleExport() {
    try {
      exportPresentationPdf(songs, bgImage, { desiredFont: fontSize, maxCols })
      onClose()
    } catch (err) {
      onAddToast('PDF export failed: ' + err.message, 'error')
    }
  }

  return (
    <Modal isOpen={isOpen} title="Presentation PDF" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Background image</p>
          <img
            src={previewUrl}
            alt="Background preview"
            className="w-full rounded"
            style={{ aspectRatio: '16/9', objectFit: 'cover' }}
          />
        </div>
        <div className="flex gap-4">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Font size</span>
            <input
              type="number"
              min={8}
              max={32}
              value={fontSize}
              onChange={e => setFontSize(Math.min(32, Math.max(8, Number(e.target.value))))}
              className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Replace background
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
