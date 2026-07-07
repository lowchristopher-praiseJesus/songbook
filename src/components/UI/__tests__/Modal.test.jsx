import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('uses max-w-md by default', () => {
    render(<Modal isOpen title="T" onClose={() => {}}><p>x</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-md')
    expect(dialog.className).not.toContain('max-w-3xl')
  })

  it('uses max-w-3xl when size="xl"', () => {
    render(<Modal isOpen title="T" onClose={() => {}} size="xl"><p>x</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-3xl')
    expect(dialog.className).not.toContain('max-w-md')
  })
})
