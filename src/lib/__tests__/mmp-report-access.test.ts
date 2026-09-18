import { describe, expect, it } from 'vitest';
import { canShowFullMmpReport } from '@/lib/mmp-report-access';

describe('MMP full report visibility', () => {
  it('shows the report for a non-supervisor with the explicit report permission', () => {
    expect(canShowFullMmpReport(false, true)).toBe(true);
  });

  it('does not show the report without its action permission', () => {
    expect(canShowFullMmpReport(false, false)).toBe(false);
  });

  it('allows supervisors with the explicit full-report permission', () => {
    expect(canShowFullMmpReport(true, true)).toBe(true);
  });
});