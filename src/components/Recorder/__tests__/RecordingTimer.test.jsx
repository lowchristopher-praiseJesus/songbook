import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordingTimer } from '../RecordingTimer'

describe('RecordingTimer', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<RecordingTimer elapsedMs={0} status="idle" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders MM:SS for elapsedMs under 1 hour', () => {
    render(<RecordingTimer elapsedMs={65000} status="recording" />)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('renders 0:00 at start', () => {
    render(<RecordingTimer elapsedMs={0} status="recording" />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('renders H:MM:SS for elapsedMs over 1 hour', () => {
    render(<RecordingTimer elapsedMs={3661000} status="recording" />)
    expect(screen.getByText('1:01:01')).toBeInTheDocument()
  })

  it('is visible when paused', () => {
    render(<RecordingTimer elapsedMs={30000} status="paused" />)
    expect(screen.getByText('0:30')).toBeInTheDocument()
  })

  it('has aria-label with elapsed time', () => {
    render(<RecordingTimer elapsedMs={90000} status="recording" />)
    expect(screen.getByLabelText(/elapsed.*1:30/i)).toBeInTheDocument()
  })
})
