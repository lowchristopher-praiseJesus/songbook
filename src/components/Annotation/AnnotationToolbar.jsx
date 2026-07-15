import { useState, useRef, useEffect } from 'react'
import { PencilIcon, EyeIcon, EyeSlashIcon, ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useAnnotationStore, MAX_LAYERS } from '../../store/annotationStore'

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#111827']

export function AnnotationToolbar() {
  const tool = useAnnotationStore(s => s.tool)
  const color = useAnnotationStore(s => s.color)
  const layers = useAnnotationStore(s => s.layers)
  const activeLayer = useAnnotationStore(s => s.activeLayer)
  const setTool = useAnnotationStore(s => s.setTool)
  const setColor = useAnnotationStore(s => s.setColor)
  const setActiveLayer = useAnnotationStore(s => s.setActiveLayer)
  const toggleLayerVisibility = useAnnotationStore(s => s.toggleLayerVisibility)
  const undoLastStroke = useAnnotationStore(s => s.undoLastStroke)
  const clearAllAnnotations = useAnnotationStore(s => s.clearAllAnnotations)

  const [confirmingReset, setConfirmingReset] = useState(false)
  const confirmTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(confirmTimerRef.current), [])

  function handleResetClick() {
    if (!confirmingReset) {
      setConfirmingReset(true)
      confirmTimerRef.current = setTimeout(() => setConfirmingReset(false), 3000)
      return
    }
    clearTimeout(confirmTimerRef.current)
    setConfirmingReset(false)
    clearAllAnnotations()
  }

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2
        bg-white/25 dark:bg-gray-900/25 backdrop-blur-xl rounded-2xl shadow-lg
        border border-gray-200/40 dark:border-gray-700/30 py-2 px-1.5"
    >
      {/* Pen / eraser */}
      <div className="flex flex-col gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5">
        <button
          type="button"
          onClick={() => setTool('pen')}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors
            ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          aria-label="Pen tool"
          aria-pressed={tool === 'pen'}
        >
          <PencilIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors
            ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          aria-label="Eraser tool"
          aria-pressed={tool === 'eraser'}
        >
          Erase
        </button>
      </div>

      {/* Color swatches */}
      <div className="grid grid-cols-2 gap-1 py-1">
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-4 h-4 rounded-full ring-offset-1 ring-offset-white dark:ring-offset-gray-900
              ${color === c ? 'ring-2 ring-gray-700 dark:ring-gray-200' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      {/* Layers */}
      <div className="flex flex-col gap-1 py-1">
        {Array.from({ length: MAX_LAYERS }, (_, i) => {
          const layer = layers[i]
          const isActive = i === activeLayer
          return (
            <div key={i} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setActiveLayer(i)}
                className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold transition-colors
                  ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                aria-label={`Select layer ${i + 1}`}
                aria-pressed={isActive}
              >
                {i + 1}
              </button>
              <button
                type="button"
                onClick={() => toggleLayerVisibility(i)}
                className="w-5 h-5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label={layer.visible ? `Hide layer ${i + 1}` : `Show layer ${i + 1}`}
              >
                {layer.visible
                  ? <EyeIcon className="w-3.5 h-3.5" />
                  : <EyeSlashIcon className="w-3.5 h-3.5" />}
              </button>
            </div>
          )
        })}
      </div>

      {/* Undo / reset */}
      <div className="flex flex-col gap-0.5 bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-0.5">
        <button
          type="button"
          onClick={undoLastStroke}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Undo last stroke"
        >
          <ArrowUturnLeftIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleResetClick}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors
            ${confirmingReset ? 'bg-red-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          aria-label={confirmingReset ? 'Confirm reset annotations' : 'Reset annotations'}
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
