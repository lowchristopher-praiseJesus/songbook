import { useState } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'
import { exportPrintPdf, DEFAULT_COMPONENTS } from '../../lib/exportPrintPdf'

const FONTS = [
  { value: 'helvetica', label: 'Sans' },
  { value: 'times',     label: 'Serif' },
  { value: 'courier',   label: 'Mono' },
]

const COMPONENT_ROWS = [
  { key: 'title',        label: 'Song Title',     sizeRange: [8, 32] },
  { key: 'lyrics',       label: 'Lyrics',          sizeRange: [6, 24] },
  { key: 'chords',       label: 'Chords',          sizeRange: [6, 24] },
  { key: 'sectionLabel', label: 'Section Labels',  sizeRange: [6, 18] },
  { key: 'annotation',   label: 'Annotations',     sizeRange: [6, 18] },
]

function initComponents() {
  return Object.fromEntries(
    Object.entries(DEFAULT_COMPONENTS).map(([k, v]) => [k, { ...v }])
  )
}

export function ExportPrintModal({ isOpen, songs, onClose, onAddToast }) {
  const [pdfTitle,    setPdfTitle]    = useState('')
  const [numCols,     setNumCols]     = useState(2)
  const [pageSize,    setPageSize]    = useState('a4')
  const [components,  setComponents]  = useState(initComponents)

  function setCompField(key, field, value) {
    setComponents(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  function handleExport() {
    try {
      exportPrintPdf(songs, { numCols, pageSize, components, pdfTitle: pdfTitle.trim() })
      onClose()
    } catch (err) {
      onAddToast('PDF export failed: ' + err.message, 'error')
    }
  }

  const toggleBtn = (active) =>
    `px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
    }`

  return (
    <Modal isOpen={isOpen} title="Print PDF" onClose={onClose}>
      <div className="space-y-5">

        {/* Optional PDF title */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            PDF Title <span className="normal-case text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={pdfTitle}
            onChange={e => setPdfTitle(e.target.value)}
            placeholder="e.g. Sunday Service — April 2026"
            className="w-full px-2.5 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500
              placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
        </div>

        {/* Columns */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Columns
          </p>
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
            {[2, 3, 4].map(n => (
              <button key={n} type="button" onClick={() => setNumCols(n)} className={toggleBtn(numCols === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Page size */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Page Size
          </p>
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
            {[['a4', 'A4'], ['letter', 'Letter']].map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => setPageSize(val)} className={toggleBtn(pageSize === val)}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Per-component settings */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Typography &amp; Colors
          </p>

          {/* Header row */}
          <div className="grid gap-x-2 mb-1 px-2" style={{ gridTemplateColumns: '7rem 1fr 3.5rem 2rem' }}>
            <span className="text-xs text-gray-400"></span>
            <span className="text-xs text-gray-400">Font</span>
            <span className="text-xs text-gray-400 text-center">Size</span>
            <span className="text-xs text-gray-400 text-center">Color</span>
          </div>

          <div className="space-y-1.5">
            {COMPONENT_ROWS.map(({ key, label, sizeRange }) => {
              const c = components[key]
              const [minSz, maxSz] = sizeRange
              return (
                <div
                  key={key}
                  className="grid items-center gap-x-2 bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5"
                  style={{ gridTemplateColumns: '7rem 1fr 3.5rem 2rem' }}
                >
                  {/* Label */}
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{label}</span>

                  {/* Font family toggle */}
                  <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
                    {FONTS.map(f => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setCompField(key, 'fontFamily', f.value)}
                        className={toggleBtn(c.fontFamily === f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Font size input */}
                  <input
                    type="number"
                    min={minSz}
                    max={maxSz}
                    value={c.fontSize}
                    onChange={e => {
                      const v = Number(e.target.value)
                      if (!isNaN(v)) setCompField(key, 'fontSize', v)
                    }}
                    onBlur={e => {
                      const clamped = Math.min(maxSz, Math.max(minSz, Number(e.target.value) || minSz))
                      setCompField(key, 'fontSize', clamped)
                    }}
                    className="w-full px-1.5 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  {/* Color swatch */}
                  <label className="flex items-center justify-center cursor-pointer">
                    <span
                      className="w-6 h-6 rounded border border-gray-300 dark:border-gray-500 block"
                      style={{ background: c.color }}
                    />
                    <input
                      type="color"
                      value={c.color}
                      onChange={e => setCompField(key, 'color', e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click a colour swatch to change it.</p>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleExport}>Export</Button>
        </div>
      </div>
    </Modal>
  )
}
