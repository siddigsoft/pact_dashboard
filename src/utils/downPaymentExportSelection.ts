import type { DownPaymentRequest } from '@/types/down-payment';

export type DownPaymentExportTab = 'pending' | 'approved' | 'processing' | 'completed' | 'closed' | 'all';
export type DownPaymentCompletedSubTab = 'paid_waiting' | 'confirmed';

interface DownPaymentExportSelectionInput {
  activeTab: DownPaymentExportTab | string;
  completedSubTab: DownPaymentCompletedSubTab;
  pending: DownPaymentRequest[];
  approved: DownPaymentRequest[];
  processing: DownPaymentRequest[];
  paidWaiting: DownPaymentRequest[];
  confirmed: DownPaymentRequest[];
  closed: DownPaymentRequest[];
  all: DownPaymentRequest[];
}

export function resolveDownPaymentExportSelection(
  input: DownPaymentExportSelectionInput,
): { data: DownPaymentRequest[]; tabLabel: string } {
  switch (input.activeTab) {
    case 'pending':
      return { data: input.pending, tabLabel: 'Pending' };
    case 'approved':
      return { data: input.approved, tabLabel: 'Approved' };
    case 'processing':
      return { data: input.processing, tabLabel: 'Processing' };
    case 'completed':
      return input.completedSubTab === 'confirmed'
        ? { data: input.confirmed, tabLabel: 'Confirmed' }
        : { data: input.paidWaiting, tabLabel: 'Paid - Waiting Confirmation' };
    case 'closed':
      return { data: input.closed, tabLabel: 'Closed' };
    case 'all':
    default:
      return { data: input.all, tabLabel: 'All' };
  }
}