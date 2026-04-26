import { Receipt, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExpenseMode = 'operational' | 'personal';

interface ExpenseTypeSelectorProps {
  value: ExpenseMode;
  onChange: (mode: ExpenseMode) => void;
  /** Compact (mobile) variant — smaller paddings, single-column-able */
  compact?: boolean;
  className?: string;
}

/**
 * Bilingual expense-type selector that sits at the top of the Cost Submission
 * page. Lets the user pick between the existing operational/project-cost flow
 * and the personal-reimbursement (My Expenses) flow.
 *
 * Used by both desktop (CostSubmission.tsx) and mobile (MobileCostSubmission.tsx).
 */
export function ExpenseTypeSelector({ value, onChange, compact = false, className }: ExpenseTypeSelectorProps) {
  const Option = ({
    mode,
    icon,
    title,
    titleAr,
    body,
    bodyAr,
    accent,
  }: {
    mode: ExpenseMode;
    icon: React.ReactNode;
    title: string;
    titleAr: string;
    body: string;
    bodyAr: string;
    accent: string;
  }) => {
    const active = value === mode;
    return (
      <button
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={active}
        className={cn(
          'group text-left rounded-lg border-2 transition-all w-full',
          compact ? 'p-3' : 'p-4',
          active
            ? `${accent} shadow-sm`
            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40',
        )}
        data-testid={`button-expense-mode-${mode}`}
      >
        <div className={cn('flex items-start gap-2', compact ? 'gap-2' : 'gap-3')}>
          <div
            className={cn(
              'rounded-md flex items-center justify-center shrink-0',
              compact ? 'h-8 w-8' : 'h-10 w-10',
              active ? 'bg-white/80 dark:bg-black/20' : 'bg-muted',
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn('font-semibold leading-tight', compact ? 'text-sm' : 'text-base')}>
              {title}
              <span className="text-xs font-normal text-muted-foreground ml-1">/ {titleAr}</span>
            </div>
            <p className={cn('text-muted-foreground mt-1 leading-snug', compact ? 'text-[11px]' : 'text-xs')}>
              {body}
            </p>
            <p
              className={cn('text-muted-foreground mt-0.5 leading-snug', compact ? 'text-[11px]' : 'text-xs')}
              dir="rtl"
            >
              {bodyAr}
            </p>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-3 sm:p-4', className)} data-testid="expense-type-selector">
      <div className="flex items-center justify-between mb-2 sm:mb-3 flex-wrap gap-2">
        <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-sm sm:text-base')}>
          What kind of request is this?
          <span className="text-xs font-normal text-muted-foreground ml-1">/ ما نوع الطلب؟</span>
        </h3>
      </div>
      <div className={cn('grid gap-2 sm:gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        <Option
          mode="operational"
          icon={<Wallet className={cn(value === 'operational' ? 'text-violet-700' : 'text-muted-foreground', compact ? 'h-4 w-4' : 'h-5 w-5')} />}
          title="Operational / Project Cost"
          titleAr="تكلفة تشغيلية / مشروع"
          body="Project funding, advances, fieldwork operating costs. Two-tier approval, signatures, reconciliation."
          bodyAr="تمويل مشروع، سلف، تكاليف تشغيلية. موافقة على مستويين وتوقيعات وتسوية."
          accent="border-violet-500 bg-violet-50 dark:bg-violet-950/30"
        />
        <Option
          mode="personal"
          icon={<Receipt className={cn(value === 'personal' ? 'text-amber-700' : 'text-muted-foreground', compact ? 'h-4 w-4' : 'h-5 w-5')} />}
          title="Personal Reimbursement"
          titleAr="استرداد شخصي"
          body="You paid out of your own pocket (taxi, lunch, supplies). Upload receipts, get reimbursed. Manager → Finance → Paid."
          bodyAr="دفعت من جيبك (مواصلات، غداء، مستلزمات). ارفع الإيصالات لاسترداد المبلغ. مدير → مالية → مدفوع."
          accent="border-amber-500 bg-amber-50 dark:bg-amber-950/30"
        />
      </div>
    </div>
  );
}

export default ExpenseTypeSelector;
