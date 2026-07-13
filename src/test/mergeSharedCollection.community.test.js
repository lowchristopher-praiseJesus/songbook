import { describe, it, expect } from 'vitest'
import { mergeSharedCollection } from '../lib/mergeSharedCollection'

// A community-imported song carries provenance but NO sbpId and NO sharedBaseline.
// mergeSharedCollection skips songs that have neither — that is precisely what makes a
// community import a snapshot rather than a live, publisher-maintained document.
const communitySong = {
  id: 'local-1',
  rawText: 'my edited chart',
  meta: {
    title: 'Oceans',
    artist: 'Hillsong',
    communitySource: { arrangementId: 'a1', publisherName: 'Chris', importedAt: '2026-07-13' },
  },
}

const sharedSong = {
  id: 'local-2',
  rawText: 'shared chart',
  meta: { title: 'Shared', artist: 'A', sbpId: 42, sharedBaseline: { title: 'Shared', artist: 'A', rawText: 'shared chart', keyIndex: 0, key: '', capo: 0, tempo: undefined } },
}

describe('mergeSharedCollection — community imports are snapshots', () => {
  it('never marks a community song as removed, even when the server ZIP omits it', () => {
    const result = mergeSharedCollection({}, [communitySong], [])
    expect(result.removed).toEqual([])
  })

  it('never auto-applies server edits onto a community song', () => {
    const result = mergeSharedCollection({}, [communitySong], [])
    expect(result.autoApplied).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('still processes genuinely shared songs alongside a community song', () => {
    const serverSongs = [{
      id: 'srv',
      rawText: 'shared chart EDITED',
      meta: { title: 'Shared', artist: 'A', sbpId: 42, keyIndex: 0, key: '', capo: 0 },
    }]

    const result = mergeSharedCollection({}, [communitySong, sharedSong], serverSongs)

    // The community song is untouched...
    expect(result.removed).toEqual([])
    // ...while the shared song still gets its server update.
    expect(result.autoApplied).toHaveLength(1)
    expect(result.autoApplied[0].localId).toBe('local-2')
    expect(result.autoApplied[0].rawText).toBe('shared chart EDITED')
  })
})
