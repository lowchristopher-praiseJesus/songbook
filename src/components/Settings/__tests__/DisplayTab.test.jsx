import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayTab } from '../DisplayTab'

function makeSettings() {
  return {
    title:       { font: 'System Default', size: 24, color: '#111827' },
    artist:      { font: 'System Default', size: 16, color: '#6b7280' },
    lyrics:      { font: 'System Default', color: '#374151' },
    chords:      { font: 'Menlo', sizeOffset: -3, color: '#6366f1' },
    sections:    { font: 'System Default', size: 12, color: '#6366f1' },
    annotations: { font: 'System Default', size: 12, color: '#9ca3af' },
    maximizeMinFontSize: 18,
  }
}

describe('DisplayTab — minimum font size row', () => {
  let updateElement, updateMinFontSize, resetAll

  beforeEach(() => {
    updateElement = vi.fn()
    updateMinFontSize = vi.fn()
    resetAll = vi.fn()
  })

  function renderTab(settings = makeSettings()) {
    return render(
      <DisplayTab
        settings={settings}
        updateElement={updateElement}
        updateMinFontSize={updateMinFontSize}
        resetAll={resetAll}
        fontSize={16}
        onFontSizeChange={vi.fn()}
      />
    )
  }

  it('shows the current minimum font size value', () => {
    renderTab()
    expect(screen.getByText('18px')).toBeInTheDocument()
  })

  it('shows the row label', () => {
    renderTab()
    expect(screen.getByText(/Minimum font size/i)).toBeInTheDocument()
  })

  it('clicking + calls updateMinFontSize with value + 1', () => {
    renderTab()
    fireEvent.click(screen.getByLabelText('Increase minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(19)
  })

  it('clicking - calls updateMinFontSize with value - 1', () => {
    renderTab()
    fireEvent.click(screen.getByLabelText('Decrease minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(17)
  })

  it('clicking + at the ceiling (28) clamps to 28', () => {
    renderTab({ ...makeSettings(), maximizeMinFontSize: 28 })
    fireEvent.click(screen.getByLabelText('Increase minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(28)
  })

  it('clicking - at the floor (8) clamps to 8', () => {
    renderTab({ ...makeSettings(), maximizeMinFontSize: 8 })
    fireEvent.click(screen.getByLabelText('Decrease minimum font size'))
    expect(updateMinFontSize).toHaveBeenCalledWith(8)
  })

  it('the row has no font picker or color picker', () => {
    renderTab()
    // The per-element rows have collapsible sections containing a <select>
    // (font picker) once opened; this row must never render one, since it's
    // always "open" (no expand/collapse) and has no font/color concept.
    expect(screen.queryByLabelText('Custom color')).not.toBeInTheDocument()
  })
})
