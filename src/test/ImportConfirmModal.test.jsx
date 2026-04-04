import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ImportConfirmModal } from '../components/Share/ImportConfirmModal';

const songs = [
  { meta: { title: 'El Shaddai' } },
  { meta: { title: 'How Great Thou Art' } },
];

describe('ImportConfirmModal', () => {
  it('renders all song titles', () => {
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('• El Shaddai')).toBeInTheDocument();
    expect(screen.getByText('• How Great Thou Art')).toBeInTheDocument();
  });

  it('shows correct song count', () => {
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('2 songs shared with you:')).toBeInTheDocument();
  });

  it('uses singular "song" for a single song', () => {
    render(
      <ImportConfirmModal
        isOpen
        songs={[{ meta: { title: 'Only One' } }]}
        onImport={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('1 song shared with you:')).toBeInTheDocument();
  });

  it('calls onImport when Import All is clicked', () => {
    const onImport = vi.fn();
    render(<ImportConfirmModal isOpen songs={songs} onImport={onImport} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Import All'));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<ImportConfirmModal isOpen songs={songs} onImport={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ImportConfirmModal isOpen={false} songs={songs} onImport={() => {}} onCancel={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows lyrics-only note when lyricsOnly prop is true', () => {
    render(
      <ImportConfirmModal
        isOpen
        songs={songs}
        lyricsOnly={true}
        onImport={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByText(/chords will be hidden/i)
    ).toBeInTheDocument();
  });

  it('does not show lyrics-only note when lyricsOnly prop is false', () => {
    render(
      <ImportConfirmModal
        isOpen
        songs={songs}
        lyricsOnly={false}
        onImport={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText(/chords will be hidden/i)).not.toBeInTheDocument();
  });
});
