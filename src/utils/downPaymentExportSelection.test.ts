import { describe, expect, it } from 'vitest';
import type { DownPaymentRequest } from '@/types/down-payment';
import { resolveDownPaymentExportSelection } from './downPaymentExportSelection';

function rows(count: number, prefix: string): DownPaymentRequest[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }) as DownPaymentRequest);
}

describe('resolveDownPaymentExportSelection', () => {
  const base = {
    activeTab: 'completed',
    pending: [],
    approved: rows(2, 'approved'),
    processing: [],
    paidWaiting: rows(24, 'waiting'),
    confirmed: rows(17, 'confirmed'),
    closed: [],
    all: rows(43, 'all'),
  };

  it('exports the visible waiting-confirmation rows', () => {
    const selection = resolveDownPaymentExportSelection({ ...base, completedSubTab: 'paid_waiting' });

    expect(selection.tabLabel).toBe('Paid - Waiting Confirmation');
    expect(selection.data).toHaveLength(24);
  });

  it('exports the visible confirmed rows', () => {
    const selection = resolveDownPaymentExportSelection({ ...base, completedSubTab: 'confirmed' });

    expect(selection.tabLabel).toBe('Confirmed');
    expect(selection.data).toHaveLength(17);
  });
});