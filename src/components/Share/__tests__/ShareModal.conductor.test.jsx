import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ShareModal } from '../ShareModal.jsx'

const songs = [{ id: 's1', meta: { title: 'Song A' }, rawText: '' }]

describe('ShareModal conductor section', () => {
  it('shows Enable Conductor Broadcast toggle in idle step', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.getByLabelText(/enable conductor broadcast/i)).toBeInTheDocument()
  })

  it('hides max followers input when toggle is off', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/max followers/i)).not.toBeInTheDocument()
  })

  it('shows max followers input when toggle is on', () => {
    render(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/enable conductor broadcast/i))
    expect(screen.getByLabelText(/max followers/i)).toBeInTheDocument()
  })
})
