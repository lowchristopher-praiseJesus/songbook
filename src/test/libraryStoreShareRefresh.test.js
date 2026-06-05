import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '../store/libraryStore';

vi.mock('../lib/storage', () => ({
  saveSong: vi.fn(),
  loadSong: vi.fn(id => ({
    id,
    rawText: 'old',
    meta: {
      title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120,
      sbpId: 'S1',
      sharedBaseline: { rawText: 'old', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
    },
    sections: [],
  })),
  deleteSong: vi.fn(),
  loadIndex: vi.fn(() => []),
  saveIndex: vi.fn(),
  getLastSongId: vi.fn(() => null),
  setLastSongId: vi.fn(),
  clearLastSongId: vi.fn(),
  loadCollections: vi.fn(() => []),
  saveCollections: vi.fn(),
  getViewMode: vi.fn(() => 'collections'),
  saveViewMode: vi.fn(),
  getTransposeState: vi.fn(() => null),
  setTransposeState: vi.fn(),
}));
vi.mock('../lib/albumApi', () => ({ loadMyAlbums: vi.fn(() => []) }));

import { saveSong, saveCollections, loadSong } from '../lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({
    index: [{ id: 'L1', title: 'Song 1', artist: '', importedAt: '' }],
    collections: [{
      id: 'C1',
      name: 'Test Set',
      createdAt: '',
      songIds: ['L1'],
      shareCode: 'abc-123',
      lastVersion: 1,
    }],
    activeSongId: null,
    activeSong: null,
  });
});

describe('addSongs with shareCode', () => {
  it('sets lastVersion: 1 on the new collection', () => {
    useLibraryStore.setState({ index: [], collections: [] });
    const { addSongs } = useLibraryStore.getState();
    addSongs(
      [{ id: 'N1', rawText: 'r', meta: { title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'SX' }, sections: [] }],
      'My Set',
      null,
      'share-xyz',
      1,
    );
    const collections = useLibraryStore.getState().collections;
    expect(collections[0].shareCode).toBe('share-xyz');
    expect(collections[0].lastVersion).toBe(1);
  });

  it('stores sharedBaseline on each imported song when shareCode provided', () => {
    useLibraryStore.setState({ index: [], collections: [] });
    const { addSongs } = useLibraryStore.getState();
    const song = {
      id: 'N1',
      rawText: 'verse',
      meta: { title: 'T', artist: '', keyIndex: 3, key: 'Eb', capo: 2, tempo: 90, sbpId: 'SX' },
      sections: [],
    };
    addSongs([song], 'My Set', null, 'share-xyz', 1);
    const saved = saveSong.mock.calls[0][0];
    expect(saved.meta.sharedBaseline).toEqual({ title: 'T', artist: '', rawText: 'verse', keyIndex: 3, key: 'Eb', capo: 2, tempo: 90 });
  });

  it('does not set sharedBaseline when no shareCode', () => {
    useLibraryStore.setState({ index: [], collections: [] });
    const { addSongs } = useLibraryStore.getState();
    const song = { id: 'N1', rawText: 'r', meta: { title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120, sbpId: 'SX' }, sections: [] };
    addSongs([song], 'My Set');
    const saved = saveSong.mock.calls[0][0];
    expect(saved.meta.sharedBaseline).toBeUndefined();
  });
});

describe('stampSharedBaseline', () => {
  it('stamps sharedBaseline from current song state when sbpId is present', () => {
    const { stampSharedBaseline } = useLibraryStore.getState();
    stampSharedBaseline('L1');
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          sharedBaseline: expect.objectContaining({
            title: 'T', keyIndex: 0, key: 'C', capo: 0, tempo: 120, rawText: 'old',
          }),
        }),
      }),
    );
  });

  it('does nothing if the song has no sbpId', () => {
    loadSong.mockReturnValueOnce({
      id: 'L1', rawText: 'old',
      meta: { title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
      sections: [],
    });
    const { stampSharedBaseline } = useLibraryStore.getState();
    stampSharedBaseline('L1');
    expect(saveSong).not.toHaveBeenCalled();
  });
});

describe('applyShareRefresh', () => {
  it('re-parses sections when rawText changes so the render view is not stale', () => {
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', {
      patches: [{
        localId: 'L1',
        metaUpdates: {},
        rawText: '{c: Verse}\nAmazing grace',
        newBaseline: { rawText: '{c: Verse}\nAmazing grace', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
      }],
      newSongs: [],
      removed: [],
      serverSbpIdOrder: ['S1'],
      newVersion: 2,
    });
    const saved = saveSong.mock.calls[0][0];
    // sections must be recomputed from the new rawText, not left as the old []
    expect(saved.sections).not.toEqual([]);
    expect(saved.rawText).toBe('{c: Verse}\nAmazing grace');
  });

  it('applies patch: updates song meta and sharedBaseline in localStorage', () => {
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', {
      patches: [{
        localId: 'L1',
        metaUpdates: { keyIndex: 4, key: 'E' },
        rawText: undefined,
        newBaseline: { rawText: 'old', keyIndex: 4, key: 'E', capo: 0, tempo: 120 },
      }],
      newSongs: [],
      removed: [],
      serverSbpIdOrder: ['S1'],
      newVersion: 2,
    });
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          keyIndex: 4,
          key: 'E',
          sharedBaseline: expect.objectContaining({ keyIndex: 4 }),
        }),
      }),
    );
    expect(useLibraryStore.getState().collections[0].lastVersion).toBe(2);
  });

  it('removes songs from collection songIds but leaves them in the library index', () => {
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', {
      patches: [],
      newSongs: [],
      removed: ['L1'],
      serverSbpIdOrder: [],
      newVersion: 2,
    });
    const col = useLibraryStore.getState().collections[0];
    expect(col.songIds).not.toContain('L1');
    expect(useLibraryStore.getState().index.some(e => e.id === 'L1')).toBe(true);
  });

  it('updates lastVersion on the collection', () => {
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', { patches: [], newSongs: [], removed: [], serverSbpIdOrder: [], newVersion: 5 });
    expect(useLibraryStore.getState().collections[0].lastVersion).toBe(5);
  });

  it('updates index entry title and artist when a patch changes them', () => {
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', {
      patches: [{
        localId: 'L1',
        metaUpdates: { title: 'New Name', artist: 'New Artist' },
        rawText: undefined,
        newBaseline: { title: 'New Name', artist: 'New Artist', rawText: 'old', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
      }],
      newSongs: [],
      removed: [],
      serverSbpIdOrder: ['S1'],
      newVersion: 2,
    });
    const indexEntry = useLibraryStore.getState().index.find(e => e.id === 'L1');
    expect(indexEntry.title).toBe('New Name');
    expect(indexEntry.artist).toBe('New Artist');
  });

  it('includes new songs in collection even when serverSbpIdOrder is empty', () => {
    useLibraryStore.setState({
      index: [],
      collections: [{ id: 'C1', name: 'S', createdAt: '', songIds: [], shareCode: 'x', lastVersion: 1 }],
      activeSongId: null,
      activeSong: null,
    });
    // Arrange loadSong to return the new song when asked
    loadSong.mockImplementation(id => {
      if (id === 'NEW1') return {
        id: 'NEW1',
        rawText: 'content',
        meta: { title: 'New Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 0,
                sbpId: 'S_NEW',
                sharedBaseline: { rawText: 'content', keyIndex: 0, key: 'C', capo: 0, tempo: 0 } },
        sections: [],
      };
      return null;
    });
    const { applyShareRefresh } = useLibraryStore.getState();
    applyShareRefresh('C1', {
      patches: [],
      newSongs: [{
        id: 'NEW1',
        rawText: 'content',
        meta: { title: 'New Song', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 0,
                sbpId: 'S_NEW',
                sharedBaseline: { rawText: 'content', keyIndex: 0, key: 'C', capo: 0, tempo: 0 } },
        sections: [],
      }],
      removed: [],
      serverSbpIdOrder: [],  // Empty — new song's sbpId not listed
      newVersion: 2,
    });
    const col = useLibraryStore.getState().collections[0];
    expect(col.songIds).toContain('NEW1');
  });
});
