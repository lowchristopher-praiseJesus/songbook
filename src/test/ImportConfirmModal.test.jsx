import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportConfirmModal } from '../components/Share/ImportConfirmModal';
import { useLibraryStore } from '../store/libraryStore';

const songs = [
  { meta: { title: 'El Shaddai' } },
  { meta: { title: 'How Great Thou Art' } },
];

beforeEach(() => {
  useLibraryStore.setState({ collections: [] })
})

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

describe('ImportConfirmModal — duplicate path', () => {
  it('shows "Already imported" heading when shareCode matches an existing collection', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', shareCode: 'abc123' }],
    })
    render(
      <ImportConfirmModal
        isOpen
        shareCode="abc123"
        songs={songs}
        onImport={() => {}}
        onCancel={() => {}}
        onGoToCollection={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: /already imported/i })).toBeInTheDocument()
    expect(screen.getByText('Easter Set')).toBeInTheDocument()
  })

  it('calls onGoToCollection with the matching collection id when "View collection" is clicked', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', shareCode: 'abc123' }],
    })
    const onGoToCollection = vi.fn()
    render(
      <ImportConfirmModal
        isOpen
        shareCode="abc123"
        songs={songs}
        onImport={() => {}}
        onCancel={() => {}}
        onGoToCollection={onGoToCollection}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /view collection/i }))
    expect(onGoToCollection).toHaveBeenCalledWith('c1')
  })

  it('calls onImport when "Import again" is clicked', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', shareCode: 'abc123' }],
    })
    const onImport = vi.fn()
    render(
      <ImportConfirmModal
        isOpen
        shareCode="abc123"
        songs={songs}
        onImport={onImport}
        onCancel={() => {}}
        onGoToCollection={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /import again/i }))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('shows normal import UI when shareCode does not match any collection', () => {
    useLibraryStore.setState({
      collections: [{ id: 'c1', name: 'Easter Set', songIds: [], createdAt: '', shareCode: 'other-code' }],
    })
    render(
      <ImportConfirmModal
        isOpen
        shareCode="abc123"
        songs={songs}
        onImport={() => {}}
        onCancel={() => {}}
        onGoToCollection={() => {}}
      />,
    )
    expect(screen.queryByText(/already imported/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 songs shared with you/i)).toBeInTheDocument()
  })

  it('shows normal import UI when shareCode is null', () => {
    render(
      <ImportConfirmModal
        isOpen
        shareCode={null}
        songs={songs}
        onImport={() => {}}
        onCancel={() => {}}
        onGoToCollection={() => {}}
      />,
    )
    expect(screen.queryByText(/already imported/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 songs shared with you/i)).toBeInTheDocument()
  })
})
