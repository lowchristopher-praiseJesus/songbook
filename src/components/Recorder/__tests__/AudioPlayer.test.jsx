import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AudioPlayer } from '../AudioPlayer'

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  window.HTMLMediaElement.prototype.load = vi.fn()
})

const baseProps = {
  src: 'blob:http://localhost/audio.webm',
  mimeType: 'audio/webm',
  durationMs: 90000,
}

describe('AudioPlayer', () => {
  it('renders a Play button initially', () => {
    render(<AudioPlayer {...baseProps} />)
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  })

  it('renders formatted duration', () => {
    render(<AudioPlayer {...baseProps} />)
    expect(screen.getByText('1:30')).toBeInTheDocument()
  })

  it('renders playback rate selector with default 1×', () => {
    render(<AudioPlayer {...baseProps} />)
    expect(screen.getByRole('combobox', { name: /playback rate/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('1×')).toBeInTheDocument()
  })

  it('rate options include 0.5, 0.75, 1, 1.25, 1.5, 2', () => {
    render(<AudioPlayer {...baseProps} />)
    const select = screen.getByRole('combobox', { name: /playback rate/i })
    const options = Array.from(select.options).map(o => o.value)
    expect(options).toEqual(['0.5', '0.75', '1', '1.25', '1.5', '2'])
  })

  it('renders a seek range input', () => {
    render(<AudioPlayer {...baseProps} />)
    expect(screen.getByRole('slider', { name: /seek/i })).toBeInTheDocument()
  })

  it('renders current time as 0:00 initially', () => {
    render(<AudioPlayer {...baseProps} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })
})
