import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NamingDialog } from '../NamingDialog'

const baseProps = {
  isOpen: true,
  defaultName: 'Amazing Grace — Apr 20, 2026',
  onSave: vi.fn(),
  onCancel: vi.fn(),
}

describe('NamingDialog', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<NamingDialog {...baseProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows dialog when isOpen is true', () => {
    render(<NamingDialog {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('pre-fills the input with defaultName', () => {
    render(<NamingDialog {...baseProps} />)
    expect(screen.getByDisplayValue('Amazing Grace — Apr 20, 2026')).toBeInTheDocument()
  })

  it('calls onSave with the current name when Save is clicked', () => {
    const onSave = vi.fn()
    render(<NamingDialog {...baseProps} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('Amazing Grace — Apr 20, 2026')
  })

  it('calls onSave with edited name', () => {
    const onSave = vi.fn()
    render(<NamingDialog {...baseProps} onSave={onSave} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My Custom Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith('My Custom Name')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<NamingDialog {...baseProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('submitting the form also calls onSave', () => {
    const onSave = vi.fn()
    render(<NamingDialog {...baseProps} onSave={onSave} />)
    fireEvent.submit(screen.getByRole('form'))
    expect(onSave).toHaveBeenCalledOnce()
  })
})
