import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemePickReview } from '../ThemePickReview'
import { useLibraryStore } from '../../../store/libraryStore'

const p = (id, title, section) => ({ id, title, artist: 'A', section, reason: `${title} reason` })
const PICKS = [
  p('a', 'Shout To The Lord', 'opening'),
  p('b', 'How Great Is Our God', 'middle'),
  p('c', 'Holy Forever', 'close'),
]

function setup(props = {}) {
  const onAdd = vi.fn()
  const onRegenerate = vi.fn()
  render(
    <ThemePickReview theme="Let us glorify God" picks={PICKS} remaining={2} loading={false}
      onAdd={onAdd} onRegenerate={onRegenerate} onCancel={vi.fn()} {...props} />
  )
  return { onAdd, onRegenerate }
}

beforeEach(() => {
  useLibraryStore.setState({ index: [] })
})

describe('ThemePickReview', () => {
  it('groups picks under Opening / Middle / Close with reasons, all ticked', () => {
    setup()
    expect(screen.getByText(/3 songs for .Let us glorify God./)).toBeInTheDocument()
    const opening = screen.getByRole('group', { name: 'Opening' })
    expect(within(opening).getByText('Shout To The Lord')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Close' })).getByText('Holy Forever')).toBeInTheDocument()
    expect(screen.getByText('Shout To The Lord reason')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').every(c => c.checked)).toBe(true)
  })

  it('unticking updates the Add button and onAdd receives only ticked picks in order', () => {
    const { onAdd } = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: /How Great Is Our God/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 songs' }))
    expect(onAdd).toHaveBeenCalledWith([PICKS[0], PICKS[2]])
  })

  it('shows the real number when fewer songs came back than requested', () => {
    setup({ picks: PICKS.slice(0, 1) })
    expect(screen.getByRole('button', { name: 'Add 1 song' })).toBeInTheDocument()
  })

  it('disables Add when nothing is ticked', () => {
    setup({ picks: PICKS.slice(0, 1) })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Add 0 songs' })).toBeDisabled()
  })

  it('regenerate shows picks left and is disabled at 0 or while loading', () => {
    const { onRegenerate } = setup()
    fireEvent.click(screen.getByRole('button', { name: '↻ Regenerate (2 left)' }))
    expect(onRegenerate).toHaveBeenCalled()
  })

  it('regenerate disabled when no picks left', () => {
    setup({ remaining: 0 })
    expect(screen.getByRole('button', { name: '↻ Regenerate (0 left)' })).toBeDisabled()
  })

  it('tags songs already in the library', () => {
    useLibraryStore.setState({ index: [{ id: 'x', title: 'Holy Forever', artist: '' }] })
    setup()
    const row = screen.getByText('Holy Forever').closest('label')
    expect(within(row).getByText('in your library')).toBeInTheDocument()
  })
})
