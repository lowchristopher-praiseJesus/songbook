import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionGroup } from '../components/Sidebar/CollectionGroup';
import { useLibraryStore } from '../store/libraryStore';

vi.mock('../lib/shareApi', () => ({
  checkShareVersion: vi.fn(),
  fetchShare: vi.fn(),
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
}));
vi.mock('../lib/parser/sbpParser', () => ({
  parseSbpFile: vi.fn(),
}));
vi.mock('../lib/mergeSharedCollection', () => ({
  mergeSharedCollection: vi.fn(),
  buildBaseline: vi.fn(),
}));
vi.mock('../lib/storage', () => ({
  saveSong: vi.fn(),
  loadSong: vi.fn(() => null),
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

import { checkShareVersion, fetchShare } from '../lib/shareApi';
import { parseSbpFile } from '../lib/parser/sbpParser';
import { mergeSharedCollection } from '../lib/mergeSharedCollection';

const group = { id: 'C1', name: 'Sunday Set', entries: [] };

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({
    index: [],
    collections: [{
      id: 'C1',
      name: 'Sunday Set',
      createdAt: '',
      songIds: [],
      shareCode: 'abc-123',
      lastVersion: 1,
    }],
    isExportMode: false,
    selectedSongIds: new Set(),
    expandedCollectionId: null,
    activeSongId: null,
    activeSong: null,
  });
});

it('renders Check for updates button when collection has shareCode', () => {
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={() => {}} />);
  expect(screen.getByLabelText(/check for updates/i)).toBeInTheDocument();
});

it('does not render Check for updates button when collection has no shareCode', () => {
  useLibraryStore.setState({
    collections: [{ id: 'C1', name: 'Sunday Set', createdAt: '', songIds: [] }],
    isExportMode: false,
    selectedSongIds: new Set(),
    expandedCollectionId: null,
  });
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={() => {}} />);
  expect(screen.queryByLabelText(/check for updates/i)).not.toBeInTheDocument();
});

it('shows "Already up to date" toast when server version is strictly older', async () => {
  // version(0) < lastVersion(1) → bail early without fetching
  checkShareVersion.mockResolvedValue({ version: 0 });
  const onAddToast = vi.fn();
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={onAddToast} />);
  fireEvent.click(screen.getByLabelText(/check for updates/i));
  await waitFor(() => expect(onAddToast).toHaveBeenCalledWith('Already up to date.', 'info'));
});

it('calls applyShareRefresh and shows success toast when update available with no conflicts', async () => {
  checkShareVersion.mockResolvedValue({ version: 2 });
  fetchShare.mockResolvedValue(new ArrayBuffer(4));
  parseSbpFile.mockResolvedValue({ songs: [] });
  mergeSharedCollection.mockReturnValue({
    autoApplied: [],
    conflicts: [],
    newSongs: [],
    removed: [],
    serverSbpIdOrder: [],
  });
  const onAddToast = vi.fn();
  const applyShareRefresh = vi.fn();
  useLibraryStore.setState({ applyShareRefresh });
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={onAddToast} />);
  fireEvent.click(screen.getByLabelText(/check for updates/i));
  await waitFor(() =>
    expect(applyShareRefresh).toHaveBeenCalledWith('C1', expect.objectContaining({ newVersion: 2 }))
  );
  await waitFor(() =>
    expect(onAddToast).toHaveBeenCalledWith(expect.stringContaining('up to date'), expect.any(String))
  );
});

it('shows expired label and hides button when link is expired', async () => {
  checkShareVersion.mockRejectedValue(Object.assign(new Error('expired'), { code: 'expired' }));
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={() => {}} />);
  fireEvent.click(screen.getByLabelText(/check for updates/i));
  await waitFor(() => expect(screen.getByText(/link expired/i)).toBeInTheDocument());
  expect(screen.queryByLabelText(/check for updates/i)).not.toBeInTheDocument();
});

it('opens ConflictPickerModal when refresh has conflicts', async () => {
  checkShareVersion.mockResolvedValue({ version: 2 });
  fetchShare.mockResolvedValue(new ArrayBuffer(4));
  parseSbpFile.mockResolvedValue({ songs: [] });
  mergeSharedCollection.mockReturnValue({
    autoApplied: [],
    conflicts: [{
      localId: 'L1',
      songTitle: 'El Shaddai',
      fields: [{ key: 'keyIndex', label: 'Key', mine: 4, theirs: 2 }],
      _autoMetaUpdates: {},
      _autoRawText: undefined,
      _newBaseline: { rawText: '', keyIndex: 2, key: 'D', capo: 0, tempo: 120 },
    }],
    newSongs: [],
    removed: [],
    serverSbpIdOrder: [],
  });
  render(<CollectionGroup group={group} onSelect={() => {}} onAddToast={() => {}} />);
  fireEvent.click(screen.getByLabelText(/check for updates/i));
  // ConflictPickerModal should appear with the conflict
  await waitFor(() => expect(screen.getByText('El Shaddai')).toBeInTheDocument());
  expect(screen.getByText('Key')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
});
