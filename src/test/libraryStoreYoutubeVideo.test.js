import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '../store/libraryStore';

vi.mock('../lib/storage', () => ({
  saveSong: vi.fn(),
  loadSong: vi.fn(id => (id === 'L1' ? {
    id: 'L1',
    rawText: 'text',
    meta: { title: 'T', artist: '', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
    sections: [],
  } : null)),
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

import { saveSong } from '../lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({ activeSongId: null, activeSong: null });
});

describe('setSongYoutubeVideo', () => {
  it('saves the videoId onto the song meta', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678');
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ youtubeVideoId: 'abc12345678' }) }),
    );
  });

  it('saves the start timestamp alongside the videoId', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678', 940);
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ youtubeVideoId: 'abc12345678', youtubeStartSeconds: 940 }),
      }),
    );
  });

  it('clears a previously saved start timestamp when none is given', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678');
    expect(saveSong).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ youtubeStartSeconds: undefined }) }),
    );
  });

  it('refreshes activeSong when the song is currently active', () => {
    useLibraryStore.setState({ activeSongId: 'L1', activeSong: { id: 'L1', meta: {} } });
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'xyz98765432');
    expect(useLibraryStore.getState().activeSong.meta.youtubeVideoId).toBe('xyz98765432');
  });

  it('does not touch activeSong when a different song is active', () => {
    useLibraryStore.setState({ activeSongId: 'OTHER', activeSong: { id: 'OTHER', meta: {} } });
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('L1', 'abc12345678');
    expect(useLibraryStore.getState().activeSong.id).toBe('OTHER');
  });

  it('does nothing when the song does not exist', () => {
    const { setSongYoutubeVideo } = useLibraryStore.getState();
    setSongYoutubeVideo('MISSING', 'abc12345678');
    expect(saveSong).not.toHaveBeenCalled();
  });
});
