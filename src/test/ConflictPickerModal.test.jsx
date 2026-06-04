import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConflictPickerModal } from '../components/Share/ConflictPickerModal';

const conflicts = [
  {
    localId: 'L1',
    songTitle: 'El Shaddai',
    fields: [{ key: 'keyIndex', label: 'Key', mine: 4, theirs: 2, mineDisplay: 'E', theirsDisplay: 'D' }],
    _autoMetaUpdates: {},
    _autoRawText: undefined,
    _newBaseline: { rawText: 'r', keyIndex: 2, key: 'D', capo: 0, tempo: 120 },
  },
];

it('renders song name and field conflict label', () => {
  render(<ConflictPickerModal conflicts={conflicts} onApply={() => {}} onCancel={() => {}} />);
  expect(screen.getByText('El Shaddai')).toBeInTheDocument();
  expect(screen.getByText('Key')).toBeInTheDocument();
});

it('Apply button is disabled until all fields are resolved', () => {
  render(<ConflictPickerModal conflicts={conflicts} onApply={() => {}} onCancel={() => {}} />);
  expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
});

it('enables Apply and calls onApply with correct patch after picking "Use theirs"', () => {
  const onApply = vi.fn();
  render(<ConflictPickerModal conflicts={conflicts} onApply={onApply} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /use theirs/i }));
  expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  expect(onApply).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        localId: 'L1',
        metaUpdates: expect.objectContaining({ keyIndex: 2 }),
        newBaseline: expect.objectContaining({ keyIndex: 2 }),
      }),
    ]),
  );
});

it('calls onApply with mine value when "Keep mine" is picked', () => {
  const onApply = vi.fn();
  render(<ConflictPickerModal conflicts={conflicts} onApply={onApply} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /keep mine/i }));
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  expect(onApply).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        localId: 'L1',
        metaUpdates: expect.objectContaining({ keyIndex: 4 }),
      }),
    ]),
  );
});

it('calls onCancel when Cancel is clicked', () => {
  const onCancel = vi.fn();
  render(<ConflictPickerModal conflicts={conflicts} onApply={() => {}} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalled();
});

it('handles rawText conflict — "Use theirs" puts value in rawText not metaUpdates', () => {
  const onApply = vi.fn();
  const rawTextConflicts = [{
    localId: 'L2',
    songTitle: 'Amazing Grace',
    fields: [{ key: 'rawText', label: 'Lyrics / Chords', mine: 'Old lyrics', theirs: 'New lyrics' }],
    _autoMetaUpdates: {},
    _autoRawText: undefined,
    _newBaseline: { rawText: 'New lyrics', keyIndex: 0, key: 'C', capo: 0, tempo: 120 },
  }];
  render(<ConflictPickerModal conflicts={rawTextConflicts} onApply={onApply} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /use theirs/i }));
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  const patch = onApply.mock.calls[0][0][0];
  expect(patch.localId).toBe('L2');
  expect(patch.rawText).toBe('New lyrics');
  expect(patch.metaUpdates.rawText).toBeUndefined();
});

it('returns one patch per conflict song', () => {
  const onApply = vi.fn();
  const multiConflicts = [
    {
      localId: 'L1',
      songTitle: 'Song A',
      fields: [{ key: 'keyIndex', label: 'Key', mine: 4, theirs: 2 }],
      _autoMetaUpdates: {},
      _autoRawText: undefined,
      _newBaseline: { rawText: '', keyIndex: 2, key: 'D', capo: 0, tempo: 120 },
    },
    {
      localId: 'L2',
      songTitle: 'Song B',
      fields: [{ key: 'capo', label: 'Capo', mine: 0, theirs: 2 }],
      _autoMetaUpdates: {},
      _autoRawText: undefined,
      _newBaseline: { rawText: '', keyIndex: 0, key: 'C', capo: 2, tempo: 120 },
    },
  ];
  render(<ConflictPickerModal conflicts={multiConflicts} onApply={onApply} onCancel={() => {}} />);
  // Apply is disabled until both songs are resolved
  expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  const keepMineButtons = screen.getAllByRole('button', { name: /keep mine/i });
  fireEvent.click(keepMineButtons[0]);
  expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled(); // still 1 unresolved
  fireEvent.click(keepMineButtons[1]);
  expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  const patches = onApply.mock.calls[0][0];
  expect(patches).toHaveLength(2);
  expect(patches[0].localId).toBe('L1');
  expect(patches[1].localId).toBe('L2');
});

it('Apply button is disabled when conflicts array is empty', () => {
  render(<ConflictPickerModal conflicts={[]} onApply={() => {}} onCancel={() => {}} />);
  expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
});
