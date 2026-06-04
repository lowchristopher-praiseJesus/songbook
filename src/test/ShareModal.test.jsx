import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareModal } from '../components/Share/ShareModal';
import { useLibraryStore } from '../store/libraryStore';
import { LicenseContext } from '../contexts/LicenseContext';

vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}));
vi.mock('../lib/shareApi', () => ({ uploadShare: vi.fn(), updateShare: vi.fn() }));
vi.mock('../lib/exportSbp', () => ({ exportSongsAsSbp: vi.fn(), computeExportId: vi.fn().mockReturnValue(1) }));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }));
vi.mock('../lib/conductorApi', () => ({
  createConductorSession: vi.fn().mockResolvedValue({}),
}));

import { uploadShare, updateShare } from '../lib/shareApi';
import { exportSongsAsSbp } from '../lib/exportSbp';

const songs = [{ meta: { title: 'El Shaddai' }, id: '1' }];

const defaultLicense = { isLicensed: false, licenseStatus: 'missing', licenseKey: null, setLicenseKey: vi.fn() };

function renderWithLicense(ui, licenseOverrides = {}) {
  const license = { ...defaultLicense, ...licenseOverrides };
  return render(
    <LicenseContext.Provider value={license}>
      {ui}
    </LicenseContext.Provider>
  );
}

beforeEach(() => {
  exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
});

describe('ShareModal', () => {
  it('renders title and default 7-day expiry when open', () => {
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    expect(screen.getByText('Share via link')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7 days')).toBeInTheDocument();
    expect(screen.getByText('1 song will be shared.')).toBeInTheDocument();
  });

  it('shows uploading spinner after clicking Create link', async () => {
    uploadShare.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
  });

  it('shows share URL input after successful upload', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'abc',
      shareUrl: 'http://app?share=abc',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByDisplayValue('http://app?share=abc')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('saves shareCode and lastVersion:1 back to the collection after successful upload', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'abc',
      shareUrl: 'http://app?share=abc',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    useLibraryStore.setState({
      collections: [{ id: 'coll-1', name: 'My Set', createdAt: '', songIds: [] }],
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="My Set" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=abc');
    const col = useLibraryStore.getState().collections.find(c => c.id === 'coll-1');
    expect(col.shareCode).toBe('abc');
    expect(col.lastVersion).toBe(1);
  });

  it('shows error message and Retry button on upload failure', async () => {
    uploadShare.mockRejectedValue(Object.assign(new Error('fail'), { code: 'upload_failed' }));
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(screen.getByText(/Upload failed/)).toBeInTheDocument();
  });

  it('resets to idle when Retry is clicked', async () => {
    uploadShare.mockRejectedValue(new Error('fail'));
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    const retryBtn = await screen.findByText('Retry');
    fireEvent.click(retryBtn);
    expect(screen.getByText('Create link')).toBeInTheDocument();
  });

  it('renders "Share lyrics only" toggle unchecked by default', () => {
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('switch', { name: /share lyrics only/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('passes lyricsOnly=true to exportSongsAsSbp when toggle is on', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'x',
      shareUrl: 'http://app?share=x',
      expiresAt: new Date().toISOString(),
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: /share lyrics only/i }));
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=x');
    expect(exportSongsAsSbp).toHaveBeenCalledWith(
      songs,
      null,  // nameValue is '' → ''.trim() || null = null
      true,
      null   // conductorCode is null when conductor is disabled
    );
  });

  it('hides conductor toggle when not licensed', () => {
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    expect(screen.queryByLabelText(/enable conductor broadcast/i)).not.toBeInTheDocument();
  });

  it('hides conductor toggle when license is expired', () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />,
      { isLicensed: false, licenseStatus: 'expired' }
    );
    expect(screen.queryByLabelText(/enable conductor broadcast/i)).not.toBeInTheDocument();
  });
});

describe('ShareModal — self-direct conductor path', () => {
  it('calls updateCollection with conductorRole "conductor" when selfDirect is on and collectionId is provided', async () => {
    const { uploadShare } = await import('../lib/shareApi')
    uploadShare.mockResolvedValue({
      shareCode: 'sc1',
      shareUrl: 'http://app?share=sc1',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    })

    const { createConductorSession } = await import('../lib/conductorApi')
    vi.mock('../lib/conductorApi', () => ({
      createConductorSession: vi.fn().mockResolvedValue({}),
    }))

    useLibraryStore.setState({
      collections: [{ id: 'col-99', name: 'Easter', songIds: [], createdAt: '' }],
    })

    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="col-99" onClose={() => {}} />,
      { isLicensed: true, licenseStatus: 'valid' }
    )

    // Enable conductor broadcast
    const conductorToggle = screen.getByRole('switch', { name: /enable conductor broadcast/i })
    fireEvent.click(conductorToggle)

    // selfDirect is on by default, click Create link
    fireEvent.click(screen.getByText(/create link/i))

    // Wait for done step
    await screen.findByText(/you're set up as the conductor/i)

    // Verify collection was updated
    const col = useLibraryStore.getState().collections.find(c => c.id === 'col-99')
    expect(col.conductorCode).toBeTruthy()
    expect(col.conductorRole).toBe('conductor')
    expect(col.conductorDirectorToken).toBeTruthy()
  })
})

describe('ShareModal — update mode', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      collections: [{
        id: 'coll-1',
        name: 'Sunday Set',
        createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        songIds: [],
        shareCode: 'abc-123',
        lastVersion: 1,
      }],
    });
  });

  it('shows "Push Update" button when collection has shareCode', () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    expect(screen.getByRole('button', { name: /push update/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create link$/i })).not.toBeInTheDocument();
  });

  it('shows live link banner with version info', () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    expect(screen.getByText(/live link exists/i)).toBeInTheDocument();
    expect(screen.getByText(/v1/i)).toBeInTheDocument();
  });

  it('calls updateShare on "Push Update" click and shows success screen', async () => {
    updateShare.mockResolvedValue({ version: 2, updatedAt: new Date().toISOString() });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: /push update/i }));
    await waitFor(() => expect(updateShare).toHaveBeenCalledWith('abc-123', expect.any(Blob)));
    await waitFor(() => expect(screen.getByText(/link updated/i)).toBeInTheDocument());
  });

  it('"New link" button triggers create flow and shows done step with new URL', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'new-code',
      shareUrl: 'http://app?share=new-code',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: /new link/i }));
    await waitFor(() => expect(uploadShare).toHaveBeenCalled());
    expect(await screen.findByDisplayValue('http://app?share=new-code')).toBeInTheDocument();
  });
});
