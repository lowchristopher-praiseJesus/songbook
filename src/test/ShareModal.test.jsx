import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareModal } from '../components/Share/ShareModal';

vi.mock('../lib/shareApi', () => ({ uploadShare: vi.fn() }));
vi.mock('../lib/exportSbp', () => ({ exportSongsAsSbp: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }));

import { uploadShare } from '../lib/shareApi';
import { exportSongsAsSbp } from '../lib/exportSbp';

const songs = [{ meta: { title: 'El Shaddai' }, id: '1' }];

beforeEach(() => {
  exportSongsAsSbp.mockResolvedValue(new Blob(['zip']));
});

describe('ShareModal', () => {
  it('renders title and default 7-day expiry when open', () => {
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    expect(screen.getByText('Share via link')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7 days')).toBeInTheDocument();
    expect(screen.getByText('1 song will be shared.')).toBeInTheDocument();
  });

  it('shows uploading spinner after clicking Create link', async () => {
    uploadShare.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
  });

  it('shows share URL input after successful upload', async () => {
    uploadShare.mockResolvedValue({
      shareCode: 'abc',
      shareUrl: 'http://app?share=abc',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByDisplayValue('http://app?share=abc')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('shows error message and Retry button on upload failure', async () => {
    uploadShare.mockRejectedValue(Object.assign(new Error('fail'), { code: 'upload_failed' }));
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(screen.getByText(/Upload failed/)).toBeInTheDocument();
  });

  it('resets to idle when Retry is clicked', async () => {
    uploadShare.mockRejectedValue(new Error('fail'));
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Create link'));
    const retryBtn = await screen.findByText('Retry');
    fireEvent.click(retryBtn);
    expect(screen.getByText('Create link')).toBeInTheDocument();
  });

  it('renders "Share lyrics only" toggle unchecked by default', () => {
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
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
    render(<ShareModal isOpen songs={songs} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: /share lyrics only/i }));
    fireEvent.click(screen.getByText('Create link'));
    await screen.findByDisplayValue('http://app?share=x');
    expect(exportSongsAsSbp).toHaveBeenCalledWith(
      songs,
      null,  // nameValue is '' → ''.trim() || null = null
      true
    );
  });
});
