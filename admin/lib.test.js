import { test, expect } from 'bun:test';
import { formatBytes, bucketDate, buildTimeline } from './lib.js';

test('formatBytes: zero', () => {
  expect(formatBytes(0)).toBe('0 B');
});

test('formatBytes: kilobytes', () => {
  expect(formatBytes(1024)).toBe('1.0 KB');
});

test('formatBytes: megabytes', () => {
  expect(formatBytes(1048576)).toBe('1.0 MB');
});

test('formatBytes: gigabytes', () => {
  expect(formatBytes(1073741824)).toBe('1.0 GB');
});

test('bucketDate: monthly', () => {
  expect(bucketDate('2026-04-15T10:00:00Z', 'monthly')).toBe('2026-04');
  expect(bucketDate('2026-12-01T00:00:00Z', 'monthly')).toBe('2026-12');
});

test('bucketDate: weekly returns YYYY-Www format', () => {
  const result = bucketDate('2026-04-13T00:00:00Z', 'weekly');
  expect(result).toMatch(/^\d{4}-W\d{2}$/);
});

test('buildTimeline: groups events by month and sorts by date', () => {
  const events = [
    { type: 'share',     createdAt: '2026-04-10T00:00:00Z' },
    { type: 'share',     createdAt: '2026-04-20T00:00:00Z' },
    { type: 'album',     createdAt: '2026-04-15T00:00:00Z' },
    { type: 'session',   createdAt: '2026-05-01T00:00:00Z' },
    { type: 'conductor', createdAt: '2026-03-05T00:00:00Z' },
  ];
  const result = buildTimeline(events, 'monthly');
  expect(result).toEqual([
    { date: '2026-03', shares: 0, albums: 0, sessions: 0, conductors: 1 },
    { date: '2026-04', shares: 2, albums: 1, sessions: 0, conductors: 0 },
    { date: '2026-05', shares: 0, albums: 0, sessions: 1, conductors: 0 },
  ]);
});

test('buildTimeline: empty events returns empty array', () => {
  expect(buildTimeline([], 'monthly')).toEqual([]);
});
