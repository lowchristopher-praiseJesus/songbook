import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'

function Probe({ onCtx }) {
  onCtx(useTheme())
  return null
}

let systemDark = false
let listeners = []

function installMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return systemDark },
    addEventListener: (_, fn) => { listeners.push(fn) },
    removeEventListener: (_, fn) => { listeners = listeners.filter(l => l !== fn) },
  }))
}

function mount(theme, mode) {
  localStorage.setItem('songsheet_theme', JSON.stringify(theme))
  if (mode) localStorage.setItem('songsheet_christmas_mode', JSON.stringify(mode))
  else localStorage.removeItem('songsheet_christmas_mode')
  return render(<ThemeProvider><div /></ThemeProvider>)
}

const root = document.documentElement

describe('ThemeProvider', () => {
  beforeEach(() => {
    systemDark = false
    listeners = []
    installMatchMedia()
    root.classList.remove('dark')
    root.removeAttribute('data-theme')
  })

  it('christmas in a light system: no dark class, data-theme=christmas', () => {
    mount('christmas')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.dataset.theme).toBe('christmas')
  })

  it('christmas in a dark system: dark class + data-theme=christmas', () => {
    systemDark = true
    mount('christmas')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.dataset.theme).toBe('christmas')
  })

  it('christmas follows live system changes', () => {
    mount('christmas')
    expect(root.classList.contains('dark')).toBe(false)
    systemDark = true
    act(() => listeners.forEach(fn => fn()))
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('leaving christmas removes data-theme', () => {
    mount('christmas')
    const { unmount } = mount('dark')
    unmount()
    expect(root.dataset.theme).toBeUndefined()
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('light and dark do not set data-theme', () => {
    mount('light')
    expect(root.dataset.theme).toBeUndefined()
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('unknown saved value falls back to light', () => {
    systemDark = true
    mount('bogus')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.dataset.theme).toBeUndefined()
  })

  it('christmas mode "dark" forces dark even on a light system', () => {
    mount('christmas', 'dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.dataset.theme).toBe('christmas')
  })

  it('christmas mode "light" forces light even on a dark system', () => {
    systemDark = true
    mount('christmas', 'light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('christmas mode "auto" (or unknown) follows the system', () => {
    systemDark = true
    mount('christmas', 'bogus')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('setChristmasMode switches the mode live', () => {
    let ctx
    localStorage.setItem('songsheet_theme', JSON.stringify('christmas'))
    localStorage.removeItem('songsheet_christmas_mode')
    render(<ThemeProvider><Probe onCtx={c => { ctx = c }} /></ThemeProvider>)
    expect(root.classList.contains('dark')).toBe(false)
    act(() => ctx.setChristmasMode('dark'))
    expect(root.classList.contains('dark')).toBe(true)
    act(() => ctx.setChristmasMode('auto'))
    expect(root.classList.contains('dark')).toBe(false)
  })
})
