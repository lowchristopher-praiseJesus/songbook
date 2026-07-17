import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SongTitleBlock } from '../SongTitleBlock'

describe('SongTitleBlock', () => {
  it('renders the title as a heading', () => {
    render(<SongTitleBlock title="Amazing Grace" />)
    expect(screen.getByRole('heading', { name: 'Amazing Grace' })).not.toBeNull()
  })

  it('renders key and tempo separated by a middle dot when both are present', () => {
    render(<SongTitleBlock title="Amazing Grace" songKey="Eb" tempo={120} />)
    expect(screen.getByText('Key: Eb')).not.toBeNull()
    expect(screen.getByText('BPM: 120')).not.toBeNull()
  })

  it('renders only the key when tempo is absent', () => {
    render(<SongTitleBlock title="Amazing Grace" songKey="Eb" />)
    expect(screen.getByText('Key: Eb')).not.toBeNull()
    expect(screen.queryByText(/BPM/)).toBeNull()
  })

  it('renders no key/tempo line at all when neither is present', () => {
    const { container } = render(<SongTitleBlock title="Amazing Grace" />)
    expect(container.querySelector('p')).toBeNull()
  })
})
