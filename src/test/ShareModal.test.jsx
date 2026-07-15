import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareModal } from '../components/Share/ShareModal';
import { useLibraryStore } from '../store/libraryStore';
import { LicenseContext } from '../contexts/LicenseContext';

vi.mock('../hooks/useTurnstile', () => ({
  default: () => ({ getToken: async () => 'mock-token' }),
}));
vi.mock('../lib/shareApi', () => ({
  uploadShare: vi.fn(),
  updateShare: vi.fn(),
  checkShareVersion: vi.fn().mockResolvedValue({ version: 1, locked: false, hasPin: false }),
  setShareLocked: vi.fn().mockResolvedValue({ locked: true }),
}));
vi.mock('../lib/exportSbp', () => ({ exportSongsAsSbp: vi.fn(), computeExportId: vi.fn().mockReturnValue(1) }));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }));
vi.mock('../lib/conductorApi', () => ({
  createConductorSession: vi.fn().mockResolvedValue({}),
}));

import { uploadShare, updateShare, checkShareVersion, setShareLocked } from '../lib/shareApi';
import { exportSongsAsSbp } from '../lib/exportSbp';
import { createConductorSession } from '../lib/conductorApi';

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

  it('renders "Lock link" toggle unchecked by default in create mode', () => {
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    const toggle = screen.getByRole('switch', { name: /lock link/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('passes locked=true and the pin to uploadShare after setting a PIN and clicking Create link', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'x',
      shareUrl: 'http://app?share=x',
      expiresAt: new Date().toISOString(),
    });
    renderWithLicense(<ShareModal isOpen songs={songs} collectionId={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: /lock link/i }));
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=x');
    expect(uploadShare).toHaveBeenCalledWith(expect.anything(), 7, 'mock-token', true, '1234');
  });
});

describe('ShareModal — self-direct conductor path', () => {
  it('calls updateCollection with conductorRole "conductor" when selfDirect is on and collectionId is provided', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'sc1',
      shareUrl: 'http://app?share=sc1',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    })

    createConductorSession.mockResolvedValueOnce({
      conductorCode: 'test-cond-code',
      directorToken: 'test-dir-token',
    })

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
    // Several tests in this block assert exact call counts (e.g. `not.toHaveBeenCalled()`)
    // on shareApi mocks — clear call history (not implementations) so tests are order-independent.
    setShareLocked.mockClear();
    checkShareVersion.mockClear();
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

  it('shows the real server-side expiry date instead of the create-mode 7-day default', async () => {
    checkShareVersion.mockResolvedValueOnce({
      version: 1,
      locked: false,
      hasPin: false,
      expiresAt: '2026-08-14T00:00:00.000Z',
    });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => {
      expect(screen.getByText(new Date('2026-08-14T00:00:00.000Z').toLocaleDateString())).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('7 days')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Link expires in')).not.toBeInTheDocument();
  });

  it('checks live lock state on open and reflects it on the toggle', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(checkShareVersion).toHaveBeenCalledWith('abc-123');
  });

  it('disables Push Update and shows a note when the live link is locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).toBeDisabled());
    expect(screen.getByText(/push update is disabled — this link is locked/i)).toBeInTheDocument();
  });

  it('clicking Lock link on a legacy locked share with no pin shows an explanatory message instead of a PIN entry', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    expect(screen.getByText(/predates pin protection/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    expect(setShareLocked).not.toHaveBeenCalled();
  });

  it('clicking Lock link on a never-locked share opens an inline PIN entry instead of calling setShareLocked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(setShareLocked).not.toHaveBeenCalled();
  });

  it('submitting a valid PIN locks a never-locked share', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    setShareLocked.mockResolvedValueOnce({ locked: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true, '1234'));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('shows a format error for a non-4-digit PIN without calling the server', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(screen.getByText(/enter a 4-digit pin/i)).toBeInTheDocument();
    expect(setShareLocked).not.toHaveBeenCalled();
  });

  it('toggling Lock link on a previously-PIN-protected, currently-unlocked share re-locks silently', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: true });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true));
  });

  it('reverts the toggle and shows an error if the silent re-lock fails', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: false, hasPin: true });
    setShareLocked.mockRejectedValueOnce(Object.assign(new Error('lock_failed'), { code: 'lock_failed' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByText(/couldn't update lock/i)).toBeInTheDocument();
  });

  it('unlocking with the correct PIN clears the lock and enables Push Update', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockResolvedValueOnce({ locked: false });
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', false, '1234'));
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
  });

  it('unlocking with the wrong PIN shows an inline error and keeps the link locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockRejectedValueOnce(Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/incorrect pin/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
  });

  it('shows a hint to use New Link after 3 wrong PIN attempts', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockRejectedValue(Object.assign(new Error('invalid_pin'), { code: 'invalid_pin' }));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    for (let i = 0; i < 3; i++) {
      fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByText(/incorrect pin/i);
    }
    expect(screen.getByText(/forgot your pin/i)).toBeInTheDocument();
  });

  it('shows a locked-specific error when Push Update hits a 423 mid-flight', async () => {
    updateShare.mockRejectedValue(Object.assign(new Error('locked'), { code: 'locked' }));
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /push update/i }));
    expect(await screen.findByText(/unlock it before pushing updates/i)).toBeInTheDocument();
  });

  it('shows "Push Update" button when collection has shareCode', async () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    expect(screen.getByRole('button', { name: /push update/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create link$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalled());
  });

  it('shows live link banner with version info', async () => {
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    expect(screen.getByText(/live link exists/i)).toBeInTheDocument();
    expect(screen.getByText(/v1/i)).toBeInTheDocument();
    await waitFor(() => expect(checkShareVersion).toHaveBeenCalled());
  });

  it('calls updateShare on "Push Update" click and shows success screen', async () => {
    updateShare.mockResolvedValue({ version: 2, updatedAt: new Date().toISOString() });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
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

  it('shows "re-locked" message when Push Update response includes locked: true', async () => {
    updateShare.mockResolvedValue({ version: 2, updatedAt: new Date().toISOString(), locked: true });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /push update/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /push update/i }));
    expect(await screen.findByText(/link updated and re-locked/i)).toBeInTheDocument();
  });

  it('New Link resets lock state to unlocked even if the current link is locked', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    uploadShare.mockResolvedValue({
      shareCode: 'new-code',
      shareUrl: 'http://app?share=new-code',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByRole('switch', { name: /lock link/i })).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByRole('button', { name: /new link/i }));
    await waitFor(() => expect(uploadShare).toHaveBeenCalled());
    expect(uploadShare).toHaveBeenCalledWith(expect.anything(), 7, 'mock-token', false, null);
  });

  it('closing the modal after unlocking without pushing re-locks the share silently', async () => {
    checkShareVersion.mockResolvedValueOnce({ version: 1, locked: true, hasPin: true });
    setShareLocked.mockResolvedValueOnce({ locked: false });
    const onClose = vi.fn();
    renderWithLicense(
      <ShareModal isOpen songs={songs} collectionId="coll-1" collectionName="Sunday Set" onClose={onClose} />
    );
    const toggle = await screen.findByRole('switch', { name: /lock link/i });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

    setShareLocked.mockResolvedValueOnce({ locked: true });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(setShareLocked).toHaveBeenCalledWith('abc-123', true));
    expect(onClose).toHaveBeenCalled();
  });
});
