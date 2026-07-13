import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareModal } from '../components/Share/ShareModal';
import { useLibraryStore } from '../store/libraryStore';
import { LicenseContext } from '../contexts/LicenseContext';

// Store-mock / render setup mirrors src/test/ShareModal.test.jsx verbatim, plus the
// community publish mock this feature introduces.
const { getTokenMock } = vi.hoisted(() => {
  return { getTokenMock: vi.fn(async () => 'mock-token') };
});

vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: getTokenMock }),
}));
vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false }),
  setShareLocked: vi.fn().mockResolvedValue({ locked: true }),
}));
// Keep the real stripNoteTokens (the {note:}-stripping test depends on it), but stub the
// heavy zip builder the way ShareModal.test.jsx does.
vi.mock('../lib/exportSbp', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, exportSongsAsSbp: vi.fn(), computeExportId: vi.fn().mockReturnValue(1) };
});
vi.mock('../lib/communityImport/communityClient', () => ({
  publishCollection: vi.fn(() => Promise.resolve({
    publicationId: 'p1', publishToken: 't1', published: 2, alreadyInPool: 0,
  })),
  unpublishCollection: vi.fn(() => Promise.resolve()),
}));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }));
vi.mock('../lib/conductorApi', () => ({
  createConductorSession: vi.fn().mockResolvedValue({}),
}));

import { uploadShare } from '../lib/shareApi';
import { exportSongsAsSbp } from '../lib/exportSbp';
import { publishCollection, unpublishCollection } from '../lib/communityImport/communityClient';

const defaultSongs = [{ id: '1', meta: { title: 'El Shaddai', artist: 'Amy Grant' }, rawText: 'verse one\nverse two' }];

const defaultLicense = { isLicensed: false, licenseStatus: 'missing', licenseKey: null, setLicenseKey: vi.fn() };

function renderShareModal({ songs = defaultSongs, collectionId = null, collectionName } = {}) {
  return render(
    <LicenseContext.Provider value={defaultLicense}>
      <ShareModal isOpen songs={songs} collectionId={collectionId} collectionName={collectionName} onClose={() => {}} />
    </LicenseContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
  uploadShare.mockResolvedValue({
    shareCode: 'sc1',
    shareUrl: 'https://app/?share=sc1',
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  publishCollection.mockResolvedValue({ publicationId: 'p1', publishToken: 't1', published: 2, alreadyInPool: 0 });
  useLibraryStore.setState({ collections: [] });
});

describe('ShareModal — community publish', () => {
  it('does not publish when the checkbox is left off', async () => {
    renderShareModal();
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => expect(uploadShare).toHaveBeenCalled());
    expect(publishCollection).not.toHaveBeenCalled();
  });

  it('requires the copyright acknowledgement before it will publish', async () => {
    renderShareModal();
    fireEvent.click(screen.getByLabelText(/also list in community/i));
    // Acknowledgement unchecked → the create button is disabled
    expect(screen.getByRole('button', { name: /create link/i })).toBeDisabled();
  });

  it('publishes after the share upload succeeds, and stores the publish token', async () => {
    useLibraryStore.setState({ collections: [{ id: 'coll-1', name: 'My Set', createdAt: '', songIds: [] }] });
    renderShareModal({ collectionId: 'coll-1', collectionName: 'My Set' });

    fireEvent.click(screen.getByLabelText(/also list in community/i));
    fireEvent.change(screen.getByPlaceholderText(/your name or church/i), { target: { value: 'Chris' } });
    fireEvent.click(screen.getByLabelText(/i have the right to share/i));
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => expect(publishCollection).toHaveBeenCalled());

    const arg = publishCollection.mock.calls[0][0];
    expect(arg.publisherName).toBe('Chris');
    expect(arg.turnstileToken).toBe('mock-token');
    expect(arg.songs[0]).toHaveProperty('title');
    expect(arg.songs[0]).toHaveProperty('body');

    await waitFor(() => {
      const col = useLibraryStore.getState().collections.find(c => c.id === 'coll-1');
      expect(col.communityPublicationId).toBe('p1');
      expect(col.communityPublishToken).toBe('t1');
    });
  });

  it('fetches a fresh Turnstile token for the publish call (does not reuse the upload token)', async () => {
    // getToken is called once for the share upload and again for the publish — two calls total.
    renderShareModal();
    fireEvent.click(screen.getByLabelText(/also list in community/i));
    fireEvent.click(screen.getByLabelText(/i have the right to share/i));
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => expect(publishCollection).toHaveBeenCalled());
    // Verify getToken was called exactly twice (once for share upload, once for publish).
    expect(getTokenMock).toHaveBeenCalledTimes(2);
    // The token must have been passed (a distinct getToken() invocation from uploadShare's).
    expect(publishCollection.mock.calls[0][0].turnstileToken).toBe('mock-token');
  });

  it('strips {note:} tokens from published bodies', async () => {
    renderShareModal({ songs: [{ id: 's1', meta: { title: 'T', artist: 'A' }, rawText: 'a\n{note: private}\nb' }] });

    fireEvent.click(screen.getByLabelText(/also list in community/i));
    fireEvent.click(screen.getByLabelText(/i have the right to share/i));
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    await waitFor(() => expect(publishCollection).toHaveBeenCalled());
    expect(publishCollection.mock.calls[0][0].songs[0].body).not.toContain('note:');
  });

  it('still returns a working share link when publishing fails', async () => {
    publishCollection.mockRejectedValueOnce(new Error('rate_limited'));
    renderShareModal();

    fireEvent.click(screen.getByLabelText(/also list in community/i));
    fireEvent.click(screen.getByLabelText(/i have the right to share/i));
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));

    // The share link is the thing the user actually came for — it must survive.
    expect(await screen.findByDisplayValue(/\?share=sc1/)).toBeInTheDocument();
    expect(await screen.findByText(/couldn't list.*community/i)).toBeInTheDocument();
  });

  it('hides the community checkbox in update mode', async () => {
    useLibraryStore.setState({
      collections: [{ id: 'coll-1', name: 'Set', createdAt: '', songIds: [], shareCode: 'abc-123', lastVersion: 1 }],
    });
    renderShareModal({ collectionId: 'coll-1', collectionName: 'Set' });
    expect(screen.queryByLabelText(/also list in community/i)).not.toBeInTheDocument();
  });
});

describe('ShareModal — unlist', () => {
  it('shows the listed state and unlists on click', async () => {
    useLibraryStore.setState({
      collections: [{
        id: 'coll-1', name: 'Judah', createdAt: '', songIds: [],
        communityPublicationId: 'p1', communityPublishToken: 't1',
      }],
    });
    renderShareModal({ collectionId: 'coll-1', collectionName: 'Judah' });

    expect(screen.getByText(/listed in community/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /unlist/i }));

    await waitFor(() => expect(unpublishCollection).toHaveBeenCalledWith('p1', 't1'));
    await waitFor(() => {
      const col = useLibraryStore.getState().collections.find(c => c.id === 'coll-1');
      expect(col.communityPublicationId).toBeUndefined();
      expect(col.communityPublishToken).toBeUndefined();
    });
  });

  it('does not show the community checkbox for an already-listed collection', () => {
    useLibraryStore.setState({
      collections: [{
        id: 'coll-1', name: 'Judah', createdAt: '', songIds: [],
        communityPublicationId: 'p1', communityPublishToken: 't1',
      }],
    });
    renderShareModal({ collectionId: 'coll-1', collectionName: 'Judah' });
    expect(screen.queryByLabelText(/also list in community/i)).not.toBeInTheDocument();
  });

  it('shows a soft error and keeps the listed banner when unlisting fails', async () => {
    unpublishCollection.mockRejectedValueOnce(new Error('network'));
    useLibraryStore.setState({
      collections: [{
        id: 'coll-1', name: 'Judah', createdAt: '', songIds: [],
        communityPublicationId: 'p1', communityPublishToken: 't1',
      }],
    });
    renderShareModal({ collectionId: 'coll-1', collectionName: 'Judah' });

    fireEvent.click(screen.getByRole('button', { name: /unlist/i }));

    expect(await screen.findByText(/couldn't unlist/i)).toBeInTheDocument();
    // The banner is still there — the collection is still listed since unlisting failed.
    expect(screen.getByText(/listed in community/i)).toBeInTheDocument();
    const col = useLibraryStore.getState().collections.find(c => c.id === 'coll-1');
    expect(col.communityPublicationId).toBe('p1');
  });
});
