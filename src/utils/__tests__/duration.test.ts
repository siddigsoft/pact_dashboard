import { describe, it, expect } from 'vitest';
import { formatDurationFromMs, medianMs, diffMsBetween } from '../duration';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDurationFromMs', () => {
  it('renders minutes only when under an hour', () => {
    expect(formatDurationFromMs(45 * MIN)).toBe('45m');
  });

  it('renders hours and minutes when under a day', () => {
    expect(formatDurationFromMs(5 * HOUR + 30 * MIN)).toBe('5h 30m');
  });

  it('drops the minutes suffix when zero', () => {
    expect(formatDurationFromMs(2 * HOUR)).toBe('2h');
  });

  it('renders days and hours when over 24h', () => {
    expect(formatDurationFromMs(2 * DAY + 4 * HOUR)).toBe('2d 4h');
  });

  it('shows <1m for very short positive durations', () => {
    expect(formatDurationFromMs(15_000)).toBe('<1m');
  });

  it('returns em dash for invalid input', () => {
    expect(formatDurationFromMs(Number.NaN)).toBe('—');
    expect(formatDurationFromMs(-1)).toBe('—');
  });
});

describe('medianMs', () => {
  it('returns null for empty input', () => {
    expect(medianMs([])).toBeNull();
  });

  it('returns the middle value for odd-length input', () => {
    expect(medianMs([1, 5, 9])).toBe(5);
  });

  it('averages the two middle values for even-length input', () => {
    expect(medianMs([1, 5, 9, 13])).toBe(7);
  });

  it('ignores invalid values', () => {
    expect(medianMs([Number.NaN, -1, 4, 8])).toBe(6);
  });
});

describe('diffMsBetween', () => {
  it('returns null when either timestamp is missing', () => {
    expect(diffMsBetween(null, '2026-01-01T00:00:00Z')).toBeNull();
    expect(diffMsBetween('2026-01-01T00:00:00Z', null)).toBeNull();
    expect(diffMsBetween(undefined, undefined)).toBeNull();
  });

  it('returns null for negative diffs (end before start)', () => {
    expect(
      diffMsBetween('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'),
    ).toBeNull();
  });

  it('returns positive diff in ms', () => {
    expect(
      diffMsBetween('2026-01-01T00:00:00Z', '2026-01-01T05:30:00Z'),
    ).toBe(5 * HOUR + 30 * MIN);
  });
});
