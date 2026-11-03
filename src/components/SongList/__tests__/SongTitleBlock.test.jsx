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

  // Imports (community, Ultimate Guitar) can store tempo as 0. React renders a bare
  // `0` from `0 && <x/>`, which showed up as "Key: A00" / "0" in Maximize mode.
  it('does not render a stray 0 when tempo is 0', () => {
    const { container } = render(<SongTitleBlock title="T" songKey="A" tempo={0} />)
    expect(container.querySelector('p').textContent).toBe('Key: A')
  })

  it('renders nothing extra when tempo is 0 and there is no key', () => {
    const { container } = render(<SongTitleBlock title="T" tempo={0} />)
    expect(container.querySelector('p')).toBeNull()
    expect(container.textContent).toBe('T')
  })

  it('falls back to keyIndex when songKey is missing', () => {
    render(<SongTitleBlock title="T" keyIndex={5} />)
    expect(screen.getByText('Key: F')).not.toBeNull()
  })

  it('falls back to a minor label from keyIndex', () => {
    render(<SongTitleBlock title="T" keyIndex={9} isMinor />)
    expect(screen.getByText('Key: Am')).not.toBeNull()
  })

  it('shows the transposed key when delta is applied', () => {
    render(<SongTitleBlock title="T" songKey="A" keyIndex={9} delta={3} />)
    expect(screen.getByText('Key: C')).not.toBeNull()
  })

  it('wraps the transposed key downward', () => {
    render(<SongTitleBlock title="T" songKey="C" keyIndex={0} delta={-2} />)
    expect(screen.getByText('Key: Bb')).not.toBeNull()
  })

  it('transposes minor keys', () => {
    render(<SongTitleBlock title="T" keyIndex={9} isMinor delta={2} />)
    expect(screen.getByText('Key: Bm')).not.toBeNull()
  })
})
