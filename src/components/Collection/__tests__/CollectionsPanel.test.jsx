import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionsPanel } from '../CollectionsPanel'

vi.mock('../../../store/libraryStore', () => ({
  useLibraryStore: (sel) => sel({
    index: [],
    collections: [],
    setIsCreatingNewCollection: vi.fn(),
  }),
}))

describe('CollectionsPanel empty state', () => {
  it('says there are no collections yet (not "no songs")', () => {
    render(<CollectionsPanel />)
    expect(screen.getByText('No collections yet')).toBeInTheDocument()
    expect(screen.queryByText('No songs yet')).not.toBeInTheDocument()
  })
})
