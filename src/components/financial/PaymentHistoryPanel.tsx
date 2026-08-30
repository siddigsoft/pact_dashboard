import { AlertTriangle, CalendarDays, Eye, History, RotateCcw, Trash2, UserRound, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PreFundSourcePaymentLink } from '@/utils/preFundLinkage';

type Props = {
  payments: PreFundSourcePaymentLink[];
  canDelete?: boolean;
  onDelete?: (payment: PreFundSourcePaymentLink) => void;
  onCorrect?: (payment: PreFundSourcePaymentLink) => void;
};

export function PaymentHistoryPanel({ payments, canDelete = false, onDelete, onCorrect }: Props) {
  const ordered = [...payments].sort((a, b) =>
    new Date(b.deletedAt || b.recordedAt || b.paymentDate || 0).getTime()
      - new Date(a.deletedAt || a.recordedAt || a.paymentDate || 0).getTime());
  const statusOf = (payment: PreFundSourcePaymentLink) =>
    payment.historyStatus ?? (payment.isDeleted ? 'deleted' : 'active');
  const latestActiveId = ordered.find(payment => statusOf(payment) === 'active')?.paymentEventId;
  const activePayments = ordered.filter(payment => statusOf(payment) === 'active');
  const activeTotals = new Map<string, number>();
  activePayments.forEach(payment => {
    const currency = payment.currency || 'SDG';
    activeTotals.set(currency, (activeTotals.get(currency) ?? 0) + payment.paymentAmount);
  });

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Payment History / سجل المدفوعات
        </p>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {[...activeTotals.entries()].map(([currency, amount]) => (
            <Badge key={currency} variant="secondary">{currency} {amount.toLocaleString()} active</Badge>
          ))}
          <Badge variant="outline">{ordered.length} {ordered.length === 1 ? 'event' : 'events'}</Badge>
        </div>
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
          No payment events recorded.
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((payment) => {
            const status = statusOf(payment);
            return (
              <div key={`${status}-${payment.paymentEventId}`} className={`rounded-lg border p-3 text-sm ${status === 'needs_review' ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold tabular-nums">
                        {payment.currency || 'SDG'} {payment.paymentAmount.toLocaleString()}
                      </span>
                      {status === 'deleted' && <Badge variant="destructive">Deleted</Badge>}
                      {status === 'reversed' && <Badge variant="outline">Reversed</Badge>}
                      {status === 'needs_review' && <Badge className="bg-amber-500">Needs reconciliation</Badge>}
                      {status === 'active' && <Badge variant="secondary">Active payment</Badge>}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet className="h-3 w-3" /> {payment.fundName}
                    </p>
                  </div>
                  {status === 'active' && (
                    <div className="flex gap-1">
                      {onCorrect && payment.isCorrectable && (
                        <Button type="button" size="sm" variant="outline" onClick={() => onCorrect(payment)}>Correct</Button>
                      )}
                      {canDelete && onDelete && payment.paymentEventId === latestActiveId && (
                        <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(payment)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete latest
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {payment.recordedAt || payment.paymentDate ? new Date(payment.recordedAt || payment.paymentDate!).toLocaleString() : 'Date unavailable'}</span>
                  {payment.recordedBy && <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> Recorder: {payment.recordedBy}</span>}
                  {payment.reference && <span>Reference: {payment.reference}</span>}
                  {payment.description && <span>{payment.description}</span>}
                  {payment.receiptUrl && (
                    <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      <Eye className="h-3 w-3" /> View receipt
                    </a>
                  )}
                  {status === 'deleted' && (
                    <div className="mt-1 rounded bg-destructive/10 p-2 text-destructive">
                      <span className="flex items-center gap-1 font-medium"><History className="h-3 w-3" /> Deleted {payment.deletedAt ? new Date(payment.deletedAt).toLocaleString() : ''}</span>
                      <span className="block">Reason: {payment.deletionReason || 'Not recorded'}</span>
                    </div>
                  )}
                  {status === 'reversed' && (
                    <div className="mt-1 rounded bg-muted p-2 text-muted-foreground">
                      <span className="flex items-center gap-1 font-medium"><RotateCcw className="h-3 w-3" /> Reversed {payment.reversedAt ? new Date(payment.reversedAt).toLocaleString() : ''}</span>
                      <span className="block">Reason: {payment.reversalReason || 'Recorded as an immutable reversal'}</span>
                    </div>
                  )}
                  {status === 'needs_review' && (
                    <div className="mt-1 rounded bg-amber-100 p-2 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                      <span className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> Historical paid amount without a verified Pre-Fund event</span>
                      <span className="block">{payment.reviewReason || 'Finance must verify the original payment evidence before assigning a fund.'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}