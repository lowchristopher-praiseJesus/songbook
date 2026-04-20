import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecorderButton } from '../RecorderButton'

const baseProps = {
  status: 'idle',
  onStart: vi.fn(),
  onStop: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
}

describe('RecorderButton', () => {
  it('renders a start recording button in idle state', () => {
    render(<RecorderButton {...baseProps} />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('calls onStart when clicked in idle state', () => {
    const onStart = vi.fn()
    render(<RecorderButton {...baseProps} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('shows stop button while recording', () => {
    render(<RecorderButton {...baseProps} status="recording" />)
    expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument()
  })

  it('calls onStop when clicked in recording state', () => {
    const onStop = vi.fn()
    render(<RecorderButton {...baseProps} status="recording" onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('shows pause button while recording', () => {
    render(<RecorderButton {...baseProps} status="recording" />)
    expect(screen.getByRole('button', { name: /pause recording/i })).toBeInTheDocument()
  })

  it('calls onPause when pause button is clicked', () => {
    const onPause = vi.fn()
    render(<RecorderButton {...baseProps} status="recording" onPause={onPause} />)
    fireEvent.click(screen.getByRole('button', { name: /pause recording/i }))
    expect(onPause).toHaveBeenCalledOnce()
  })

  it('shows resume button while paused', () => {
    render(<RecorderButton {...baseProps} status="paused" />)
    expect(screen.getByRole('button', { name: /resume recording/i })).toBeInTheDocument()
  })

  it('calls onResume when resume button is clicked', () => {
    const onResume = vi.fn()
    render(<RecorderButton {...baseProps} status="paused" onResume={onResume} />)
    fireEvent.click(screen.getByRole('button', { name: /resume recording/i }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('is disabled in requesting state', () => {
    render(<RecorderButton {...baseProps} status="requesting" />)
    expect(screen.getByRole('button', { name: /start recording/i })).toBeDisabled()
  })

  it('shows pulsing indicator while recording', () => {
    const { container } = render(<RecorderButton {...baseProps} status="recording" />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
