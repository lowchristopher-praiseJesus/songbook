import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../shareApi', () => ({ updateShare: vi.fn() }));
vi.mock('../exportSbp', () => ({ exportSongsAsSbp: vi.fn() }));
vi.mock('../storage', () => ({ loadSong: vi.fn(), getTransposeState: vi.fn() }));

import { pushCollectionUpdate } from '../pushCollectionUpdate';
import { updateShare } from '../shareApi';
import { exportSongsAsSbp } from '../exportSbp';
import { loadSong, getTransposeState } from '../storage';

const blob = new Blob(['zip']);

const songsById = {
  s1: { id: 's1', rawText: '[C]Hello [G]world', meta: { title: 'One', keyIndex: 0, capo: 0 } },
  s2: { id: 's2', rawText: '[D]Two', meta: { title: 'Two', keyIndex: 2, capo: 1 } },
};

function makeCollection(overrides = {}) {
  return { id: 'C1', name: 'Sunday Set', songIds: ['s1', 's2'], shareCode: 'abc', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSong.mockImplementation(id => songsById[id] ?? null);
  getTransposeState.mockReturnValue(null);
  exportSongsAsSbp.mockResolvedValue(blob);
  updateShare.mockResolvedValue({ version: 4, updatedAt: '2026-10-23T00:00:00Z' });
});

describe('pushCollectionUpdate', () => {
  it('exports the collection songs in order under the collection name and uploads to its share code', async () => {
    const result = await pushCollectionUpdate(makeCollection());
    const [songs, name, lyricsOnly, conductorCode] = exportSongsAsSbp.mock.calls[0];
    expect(songs.map(s => s.id)).toEqual(['s1', 's2']);
    expect(name).toBe('Sunday Set');
    expect(lyricsOnly).toBe(false);
    expect(conductorCode).toBeNull();
    expect(updateShare).toHaveBeenCalledWith('abc', blob);
    expect(result.version).toBe(4);
  });

  it('skips song ids that no longer exist', async () => {
    await pushCollectionUpdate(makeCollection({ songIds: ['s1', 'gone', 's2'] }));
    expect(exportSongsAsSbp.mock.calls[0][0].map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('bakes the saved transpose and capo into the exported songs', async () => {
    getTransposeState.mockImplementation(id => (id === 's1' ? { delta: 2, capo: 3 } : null));
    await pushCollectionUpdate(makeCollection());
    const [s1, s2] = exportSongsAsSbp.mock.calls[0][0];
    expect(s1.rawText).toBe('[D]Hello [A]world');
    expect(s1.meta.keyIndex).toBe(2);
    expect(s1.meta.capo).toBe(3);
    expect(s2.rawText).toBe('[D]Two');
    expect(s2.meta.capo).toBe(1);
  });

  it('re-stamps the lyrics-only flag stored on the collection', async () => {
    await pushCollectionUpdate(makeCollection({ shareLyricsOnly: true }));
    expect(exportSongsAsSbp.mock.calls[0][2]).toBe(true);
  });

  it('lets the caller override the name and lyrics-only flag', async () => {
    await pushCollectionUpdate(makeCollection({ shareLyricsOnly: true }), { name: '  Renamed  ', lyricsOnly: false });
    expect(exportSongsAsSbp.mock.calls[0][1]).toBe('Renamed');
    expect(exportSongsAsSbp.mock.calls[0][2]).toBe(false);
  });

  it('passes a null name when the name is blank', async () => {
    await pushCollectionUpdate(makeCollection(), { name: '   ' });
    expect(exportSongsAsSbp.mock.calls[0][1]).toBeNull();
  });

  it('re-stamps the conductor code when a broadcast is attached', async () => {
    await pushCollectionUpdate(makeCollection({ conductorCode: 'K1' }));
    expect(exportSongsAsSbp.mock.calls[0][3]).toBe('K1');
  });

  it('drops the conductor code from the ZIP once the broadcast has ended', async () => {
    await pushCollectionUpdate(makeCollection({ conductorCode: 'K1', conductorEnded: true }));
    expect(exportSongsAsSbp.mock.calls[0][3]).toBeNull();
  });

  it('propagates upload errors such as a locked link', async () => {
    updateShare.mockRejectedValue(Object.assign(new Error('locked'), { code: 'locked' }));
    await expect(pushCollectionUpdate(makeCollection())).rejects.toMatchObject({ code: 'locked' });
  });
});
