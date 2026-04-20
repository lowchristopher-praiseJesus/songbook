const FONT_MAP = {
  'System Default': '-apple-system, BlinkMacSystemFont, sans-serif',
  'Georgia': 'Georgia, serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Helvetica Neue': "'Helvetica Neue', Helvetica, sans-serif",
  'Arial': 'Arial, sans-serif',
  'Courier New': "'Courier New', Courier, monospace",
  'Menlo': "Menlo, Monaco, 'Courier New', monospace",
  'Monaco': "Monaco, 'Courier New', monospace",
}

export const FONT_OPTIONS = Object.keys(FONT_MAP)

const DEFAULTS = {
  lyrics:      { font: 'System Default', color: '#374151' },
  chords:      { font: 'Menlo', sizeOffset: -3, color: '#6366f1' },
  sections:    { font: 'System Default', size: 12, color: '#6366f1' },
  annotations: { font: 'System Default', size: 12, color: '#9ca3af' },
}

const KEYS = {
  lyrics:      'songsheet_display_lyrics',
  chords:      'songsheet_display_chords',
  sections:    'songsheet_display_sections',
  annotations: 'songsheet_display_annotations',
}

function lightenColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  const newL = Math.min(0.92, l + 0.30)
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  let rr, gg, bb
  if (s === 0) {
    rr = gg = bb = newL
  } else {
    const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s
    const p = 2 * newL - q
    rr = hue2rgb(p, q, h + 1/3)
    gg = hue2rgb(p, q, h)
    bb = hue2rgb(p, q, h - 1/3)
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`
}

function resolveFont(name) {
  return FONT_MAP[name] ?? FONT_MAP['System Default']
}

function applyToDOM(settings) {
  const el = document.documentElement
  const { lyrics, chords, sections, annotations } = settings

  el.style.setProperty('--lyrics-font', resolveFont(lyrics.font))
  el.style.setProperty('--lyrics-color', lyrics.color)
  el.style.setProperty('--lyrics-color-dark', lightenColor(lyrics.color))

  el.style.setProperty('--chord-font', resolveFont(chords.font))
  el.style.setProperty('--chord-size-offset', `${chords.sizeOffset}px`)
  el.style.setProperty('--chord-color', chords.color)
  el.style.setProperty('--chord-color-dark', lightenColor(chords.color))

  el.style.setProperty('--section-font', resolveFont(sections.font))
  el.style.setProperty('--section-size', `${sections.size}px`)
  el.style.setProperty('--section-color', sections.color)
  el.style.setProperty('--section-color-dark', lightenColor(sections.color))

  el.style.setProperty('--annotation-font', resolveFont(annotations.font))
  el.style.setProperty('--annotation-size', `${annotations.size}px`)
  el.style.setProperty('--annotation-color', annotations.color)
  el.style.setProperty('--annotation-color-dark', lightenColor(annotations.color))
}

function loadSettings() {
  const result = {}
  for (const [key, storageKey] of Object.entries(KEYS)) {
    try {
      const raw = localStorage.getItem(storageKey)
      result[key] = raw ? { ...DEFAULTS[key], ...JSON.parse(raw) } : { ...DEFAULTS[key] }
    } catch {
      result[key] = { ...DEFAULTS[key] }
    }
  }
  return result
}

import { useState, useCallback } from 'react'

export function useDisplaySettings() {
  const [settings, setSettings] = useState(() => {
    const s = loadSettings()
    applyToDOM(s)
    return s
  })

  const updateElement = useCallback((element, patch) => {
    setSettings(prev => {
      const updated = { ...prev, [element]: { ...prev[element], ...patch } }
      localStorage.setItem(KEYS[element], JSON.stringify(updated[element]))
      applyToDOM(updated)
      return updated
    })
  }, [])

  const resetAll = useCallback(() => {
    for (const [key, storageKey] of Object.entries(KEYS)) {
      localStorage.setItem(storageKey, JSON.stringify(DEFAULTS[key]))
    }
    const fresh = loadSettings()
    applyToDOM(fresh)
    setSettings(fresh)
  }, [])

  return { settings, updateElement, resetAll }
}
