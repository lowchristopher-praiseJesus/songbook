import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordingIndicator } from '../RecordingIndicator'
import { useRecordingStore } from '../../../store/recordingStore'

beforeEach(() => {
  useRecordingStore.setState({ status: 'idle', elapsedMs: 0 })
})

describe('RecordingIndicator', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<RecordingIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when status is requesting', () => {
    useRecordingStore.setState({ status: 'requesting', elapsedMs: 0 })
    const { container } = render(<RecordingIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('shows elapsed time when recording', () => {
    useRecordingStore.setState({ status: 'recording', elapsedMs: 65000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('shows pause icon when paused', () => {
    useRecordingStore.setState({ status: 'paused', elapsedMs: 30000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('⏸')).toBeInTheDocument()
    expect(screen.getByText('0:30')).toBeInTheDocument()
  })

  it('elapsed time is red when recording', () => {
    useRecordingStore.setState({ status: 'recording', elapsedMs: 5000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('0:05').className).toMatch(/text-red/)
  })

  it('elapsed time is gray when paused', () => {
    useRecordingStore.setState({ status: 'paused', elapsedMs: 5000 })
    render(<RecordingIndicator />)
    expect(screen.getByText('0:05').className).toMatch(/text-gray/)
  })
})
