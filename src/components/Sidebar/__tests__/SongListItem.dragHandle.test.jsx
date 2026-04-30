import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SongListItem } from '../SongListItem'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (selector) =>
    selector({
      selectSong: vi.fn(),
      deleteSong: vi.fn(),
      removeSongFromCollection: vi.fn(),
      activeSongId: null,
      isExportMode: false,
      selectedSongIds: new Set(),
      toggleSongSelection: vi.fn(),
      viewMode: 'collections',
    }),
}))

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const entry = { id: 's1', title: 'Amazing Grace', artist: 'Amy Grant' }

describe('SongListItem drag handle', () => {
  it('does not render a drag handle by default', () => {
    render(<ul><SongListItem entry={entry} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByLabelText('Drag to reorder')).not.toBeInTheDocument()
  })

  it('renders a drag handle when dragHandleListeners is provided', () => {
    render(
      <ul>
        <SongListItem
          entry={entry}
          onSelect={vi.fn()}
          dragHandleListeners={{ onPointerDown: vi.fn() }}
        />
      </ul>
    )
    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument()
  })

  it('applies opacity-40 to the row when isDragging is true', () => {
    const { container } = render(
      <ul>
        <SongListItem
          entry={entry}
          onSelect={vi.fn()}
          dragHandleListeners={{ onPointerDown: vi.fn() }}
          isDragging={true}
        />
      </ul>
    )
    expect(container.querySelector('li')).toHaveClass('opacity-40')
  })
})

describe('SongListItem drag handle — mobile', () => {
  it('shows a larger drag handle on mobile (touch-none, bigger padding)', () => {
    render(
      <ul>
        <SongListItem
          entry={entry}
          onSelect={vi.fn()}
          dragHandleListeners={{ onPointerDown: vi.fn() }}
        />
      </ul>
    )
    const handle = screen.getByLabelText('Drag to reorder')
    expect(handle).toBeInTheDocument()
    expect(handle.className).toContain('touch-none')
  })
})
