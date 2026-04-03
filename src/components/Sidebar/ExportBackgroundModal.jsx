import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPresentationPdf } from '../../lib/exportPresentationPdf'
import defaultBgUrl from '../../assets/Background.png'

export function ExportBackgroundModal({ isOpen, songs, onClose, onAddToast }) {
  const [previewUrl, setPreviewUrl] = useState(defaultBgUrl)
  const [bgImage, setBgImage] = useState(null)

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
      exportPresentationPdf(songs, bgImage)
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
