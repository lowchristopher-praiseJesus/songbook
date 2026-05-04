import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBroadcastRegistry } from '../hooks/useBroadcastRegistry'
import { useLibraryStore } from '../store/libraryStore'

beforeEach(() => {
  localStorage.clear()
  useLibraryStore.setState({
    collections: [],
    index: [],
  })
})

describe('useBroadcastRegistry', () => {
  it('returns empty array when no collections have conductorCode', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Normal', songIds: [], createdAt: '' }],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(0)
  })

  it('includes collections with conductorCode and no conductorEnded', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: [], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor' },
        { id: 'c2', name: 'Normal', songIds: [], createdAt: '' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(1)
    expect(result.current.broadcasts[0].id).toBe('c1')
  })

  it('excludes ended broadcasts from broadcasts list, includes in endedBroadcasts', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: [], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor', conductorEnded: true },
        { id: 'c2', name: 'CNY', songIds: [], createdAt: '', conductorCode: 'XYZ', conductorRole: 'follower' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    expect(result.current.broadcasts).toHaveLength(1)
    expect(result.current.broadcasts[0].id).toBe('c2')
    expect(result.current.endedBroadcasts).toHaveLength(1)
    expect(result.current.endedBroadcasts[0].id).toBe('c1')
  })

  it('forgetBroadcast strips conductor fields from the collection', () => {
    useLibraryStore.setState({
      collections: [
        { id: 'c1', name: 'Easter', songIds: ['s1'], createdAt: '', conductorCode: 'ABC', conductorRole: 'conductor' },
      ],
    })
    const { result } = renderHook(() => useBroadcastRegistry())
    act(() => result.current.forgetBroadcast('c1'))
    const col = useLibraryStore.getState().collections.find(c => c.id === 'c1')
    expect(col).toBeDefined()
    expect(col.conductorCode).toBeUndefined()
    expect(col.conductorRole).toBeUndefined()
    expect(col.songIds).toEqual(['s1']) // songs preserved
  })
})
