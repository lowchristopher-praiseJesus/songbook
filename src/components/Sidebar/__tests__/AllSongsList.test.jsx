import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AllSongsList } from '../AllSongsList'

// Mock SongListItem to keep tests focused on AllSongsList logic
vi.mock('../SongListItem', () => ({
  SongListItem: ({ entry }) => <li data-testid="song-item">{entry.title}</li>,
}))

const entries = [
  { id: '1', title: 'Amazing Grace', artist: 'Traditional', collectionId: 'c1' },
  { id: '2', title: 'Blessed Be', artist: 'Matt Redman', collectionId: 'c1' },
  { id: '3', title: 'El Shaddai', artist: 'Amy Grant', collectionId: 'c2' },
  { id: '4', title: 'Emmanuel', artist: 'Michael W. Smith', collectionId: 'c2' },
]

describe('AllSongsList', () => {
  it('renders all songs', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    expect(screen.getAllByTestId('song-item')).toHaveLength(4)
  })

  it('renders letter dividers for each group', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  it('does not render duplicate letter dividers', () => {
    render(<ul><AllSongsList entries={entries} /></ul>)
    // Both El Shaddai and Emmanuel start with E — only one E divider
    const eDividers = screen.getAllByText('E')
    expect(eDividers).toHaveLength(1)
  })

  it('renders empty fragment when entries is empty', () => {
    const { container } = render(<ul><AllSongsList entries={[]} /></ul>)
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('sorts entries A-Z regardless of input order', () => {
    const reversed = [...entries].reverse()
    render(<ul><AllSongsList entries={reversed} /></ul>)
    const items = screen.getAllByTestId('song-item')
    expect(items[0].textContent).toBe('Amazing Grace')
    expect(items[1].textContent).toBe('Blessed Be')
  })
})
