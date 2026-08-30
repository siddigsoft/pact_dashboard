import { CalendarDays, Eye, History, Trash2, UserRound, Wallet } from 'lucide-react';
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
  const latestActiveId = ordered.find(payment => !payment.isDeleted)?.paymentEventId;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Payment History / سجل المدفوعات
        </p>
        <Badge variant="outline">{ordered.length} {ordered.length === 1 ? 'payment' : 'payments'}</Badge>
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
          No payment events recorded.
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((payment) => (
            <div key={`${payment.isDeleted ? 'deleted' : 'active'}-${payment.paymentEventId}`} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold tabular-nums">
                      {payment.currency || 'SDG'} {payment.paymentAmount.toLocaleString()}
                    </span>
                    {payment.isDeleted ? <Badge variant="destructive">Deleted</Badge> : <Badge variant="secondary">Active payment</Badge>}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Wallet className="h-3 w-3" /> {payment.fundName}
                  </p>
                </div>
                {!payment.isDeleted && (
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
                {payment.isDeleted && (
                  <div className="mt-1 rounded bg-destructive/10 p-2 text-destructive">
                    <span className="flex items-center gap-1 font-medium"><History className="h-3 w-3" /> Deleted {payment.deletedAt ? new Date(payment.deletedAt).toLocaleString() : ''}</span>
                    <span className="block">Reason: {payment.deletionReason || 'Not recorded'}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}