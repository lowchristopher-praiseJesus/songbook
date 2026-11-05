import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

vi.mock('../../../lib/themePickApi', () => ({ getThemePickQuota: vi.fn(), requestThemePicks: vi.fn() }))
vi.mock('../../../lib/createCollectionFromPicks', () => ({ createCollectionFromPicks: vi.fn() }))
vi.mock('../../../hooks/useTurnstile', () => ({ default: () => ({ getToken: vi.fn().mockResolvedValue('tok') }) }))

import { NewCollectionCreator } from '../NewCollectionCreator'
import { getThemePickQuota, requestThemePicks } from '../../../lib/themePickApi'
import { createCollectionFromPicks } from '../../../lib/createCollectionFromPicks'
import { useLibraryStore } from '../../../store/libraryStore'

const p = (id, title, section = 'opening') => ({ id, title, artist: 'A', section, reason: 'r' })
const PICKS = [p('a', 'Shout To The Lord'), p('b', 'Holy Forever', 'close')]
const QUOTA = { remaining: 3, limit: 5, resetsAt: '2026-11-06T00:00:00.000Z' }

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

const onAddToast = vi.fn()

async function renderCreator() {
  render(<NewCollectionCreator onAddToast={onAddToast} />)
  await screen.findByText('3 of 5 picks left today')
}

function fill({ name = 'Sunday', theme = 'Let us glorify God', count } = {}) {
  fireEvent.change(screen.getByPlaceholderText('Collection name…'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Theme (optional)'), { target: { value: theme } })
  if (count !== undefined) {
    const input = screen.getByLabelText('Songs')
    fireEvent.change(input, { target: { value: count } })
    fireEvent.blur(input)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useLibraryStore.setState({ index: [], collections: [], isCreatingNewCollection: true })
  getThemePickQuota.mockResolvedValue(QUOTA)
  requestThemePicks.mockResolvedValue({ picks: PICKS, remaining: 2 })
  createCollectionFromPicks.mockResolvedValue({ collectionId: 'new-id', failedTitles: [] })
})

describe('NewCollectionCreator — theme picker', () => {
  it('with no theme keeps the plain Create button', async () => {
    await renderCreator()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '✨ Create & pick songs' })).toBeNull()
  })

  it('with a theme shows Create & pick songs and Create empty', async () => {
    await renderCreator()
    fill()
    expect(screen.getByRole('button', { name: '✨ Create & pick songs' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create empty' })).toBeEnabled()
  })

  it('needs a name before picking', async () => {
    await renderCreator()
    fill({ name: '' })
    expect(screen.getByRole('button', { name: '✨ Create & pick songs' })).toBeDisabled()
  })

  it.each([['', '10'], ['0', '1'], ['25', '20'], ['abc', '10'], ['7', '7']])(
    'count %j becomes %s on blur', async (typed, shown) => {
      await renderCreator()
      fill({ count: typed })
      expect(screen.getByLabelText('Songs')).toHaveValue(shown)
    })

  it('sends one request even when clicked twice or Enter is pressed while loading', async () => {
    const d = deferred()
    requestThemePicks.mockReturnValue(d.promise)
    await renderCreator()
    fill({ count: '2' })
    const btn = screen.getByRole('button', { name: '✨ Create & pick songs' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.keyDown(screen.getByPlaceholderText('Collection name…'), { key: 'Enter' })
    await waitFor(() => expect(requestThemePicks).toHaveBeenCalledTimes(1))
    expect(requestThemePicks).toHaveBeenCalledWith({ theme: 'Let us glorify God', count: 2, exclude: [], turnstileToken: 'tok' })
    await act(async () => d.resolve({ picks: PICKS, remaining: 2 }))
  })

  it('cancel while loading: a late response creates nothing and shows no review', async () => {
    const d = deferred()
    requestThemePicks.mockReturnValue(d.promise)
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    await waitFor(() => expect(requestThemePicks).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => d.resolve({ picks: PICKS, remaining: 2 }))
    expect(createCollectionFromPicks).not.toHaveBeenCalled()
    expect(useLibraryStore.getState().collections).toEqual([])
    expect(useLibraryStore.getState().isCreatingNewCollection).toBe(false)
  })

  it('shows the review, then Add creates the collection, selects it and closes', async () => {
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add 2 songs' }))
    await waitFor(() => expect(createCollectionFromPicks).toHaveBeenCalledWith('Sunday', PICKS))
    await waitFor(() => expect(useLibraryStore.getState().isCreatingNewCollection).toBe(false))
    expect(useLibraryStore.getState().selectedCollectionId).toBe('new-id')
  })

  it('regenerate excludes every song shown so far and updates picks left', async () => {
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    await screen.findByRole('button', { name: '↻ Regenerate (2 left)' })
    requestThemePicks.mockResolvedValueOnce({ picks: [p('c', 'Glory To The Lamb')], remaining: 1 })
    fireEvent.click(screen.getByRole('button', { name: '↻ Regenerate (2 left)' }))
    await screen.findByText('Glory To The Lamb')
    expect(requestThemePicks).toHaveBeenLastCalledWith(expect.objectContaining({ exclude: ['a', 'b'] }))
    requestThemePicks.mockResolvedValueOnce({ picks: [p('d', 'Worthy')], remaining: 0 })
    fireEvent.click(screen.getByRole('button', { name: '↻ Regenerate (1 left)' }))
    await screen.findByText('Worthy')
    expect(requestThemePicks).toHaveBeenLastCalledWith(expect.objectContaining({ exclude: ['a', 'b', 'c'] }))
    expect(screen.getByRole('button', { name: 'Add 1 song' })).toBeInTheDocument()
  })

  it('no picks left: pick disabled with reset message, Create empty still works', async () => {
    getThemePickQuota.mockResolvedValue({ ...QUOTA, remaining: 0 })
    render(<NewCollectionCreator onAddToast={onAddToast} />)
    await screen.findByText(/No picks left today — resets at/)
    fill()
    expect(screen.getByRole('button', { name: '✨ Create & pick songs' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Create empty' }))
    expect(useLibraryStore.getState().collections.map(c => c.name)).toEqual(['Sunday'])
  })

  it('picker asleep shows the friendly message and creates nothing', async () => {
    requestThemePicks.mockRejectedValue(Object.assign(new Error('x'), { code: 'picker_unavailable' }))
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    await screen.findByText('The song picker is asleep — try again in a minute')
    expect(useLibraryStore.getState().collections).toEqual([])
  })

  it('daily limit hit mid-session shows the exhausted message', async () => {
    requestThemePicks.mockRejectedValue(Object.assign(new Error('x'), { code: 'daily_limit', resetsAt: QUOTA.resetsAt }))
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    await screen.findByText(/No picks left today — resets at/)
  })

  it('names songs that could not be added', async () => {
    createCollectionFromPicks.mockResolvedValue({ collectionId: 'new-id', failedTitles: ['Holy Forever'] })
    await renderCreator()
    fill()
    fireEvent.click(screen.getByRole('button', { name: '✨ Create & pick songs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add 2 songs' }))
    await waitFor(() => expect(onAddToast).toHaveBeenCalledWith(expect.stringContaining('Holy Forever'), 'error'))
  })
})
