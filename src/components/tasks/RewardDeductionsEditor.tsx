/**
 * RewardDeductionsEditor — small reusable editor + live breakdown.
 *
 * Used in every place where an admin can set a task's completion reward:
 *   - MyTasks.tsx New Task dialog
 *   - MyTasks.tsx Edit dialog
 *   - MyTasksV2.tsx New Task dialog
 *   - MyTasksV2.tsx Edit / Completion Reward editor
 *   - TaskAdmin.tsx Daily Template form
 *
 * Shape mirrors src/pages/Payroll.tsx allowances/deductions UI for consistency.
 */
import { useMemo } from 'react';
import { Plus, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeRewardBreakdown, type RewardDeduction } from '@/utils/rewardCalc';

interface Props {
  /** Gross reward amount (string for controlled input compatibility, parsed internally). */
  grossAmount: number | string | null | undefined;
  currency: string;
  deductions: RewardDeduction[];
  onChange: (next: RewardDeduction[]) => void;
  /** Compact = smaller spacing for use inside dense dialogs. */
  compact?: boolean;
  /** When true, show the Trophy header label. Default true. */
  showHeader?: boolean;
}

export function RewardDeductionsEditor({
  grossAmount, currency, deductions, onChange, compact = false, showHeader = true,
}: Props) {
  const gross = typeof grossAmount === 'string' ? parseFloat(grossAmount) || 0 : (grossAmount ?? 0);
  const breakdown = useMemo(() => computeRewardBreakdown(gross, deductions), [gross, deductions]);

  const update = (i: number, patch: Partial<RewardDeduction>) => {
    const next = deductions.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    onChange(next);
  };
  const add = () => onChange([...deductions, { name: '', type: 'fixed', amount: 0 }]);
  const remove = (i: number) => onChange(deductions.filter((_, idx) => idx !== i));

  const noGross = !gross || gross <= 0;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Trophy className="h-3 w-3 text-amber-600" />
            Deductions <span className="text-muted-foreground/70 font-normal normal-case tracking-normal">(optional, mirror salary)</span>
          </Label>
          <Button
            type="button" variant="ghost" size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={add}
            disabled={noGross}
            data-testid="button-add-reward-deduction"
          >
            <Plus className="h-3 w-3 mr-0.5" /> Add
          </Button>
        </div>
      )}

      {noGross && deductions.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">Set a gross reward amount to add deductions.</p>
      )}

      {deductions.length > 0 && (
        <div className="space-y-1 rounded-lg border bg-muted/20 p-1.5">
          {deductions.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-center" data-testid={`row-reward-deduction-${i}`}>
              <Input
                value={d.name}
                onChange={e => update(i, { name: e.target.value })}
                placeholder="Tax / Social"
                className="col-span-5 h-8 text-xs"
                data-testid={`input-deduction-name-${i}`}
              />
              <Select value={d.type} onValueChange={v => update(i, { type: v as 'fixed' | 'percent' })}>
                <SelectTrigger className="col-span-3 h-8 text-xs" data-testid={`select-deduction-type-${i}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number" min="0" step="0.01"
                value={String(d.amount ?? '')}
                onChange={e => update(i, { amount: parseFloat(e.target.value) || 0 })}
                placeholder={d.type === 'percent' ? '%' : currency}
                className="col-span-3 h-8 text-xs text-right"
                data-testid={`input-deduction-amount-${i}`}
              />
              <Button
                type="button" variant="ghost" size="icon"
                className="col-span-1 h-7 w-7 text-muted-foreground hover:text-rose-600"
                onClick={() => remove(i)}
                data-testid={`button-remove-deduction-${i}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Live breakdown — shown only when there is a reward */}
      {gross > 0 && (
        <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-2 text-[11px] space-y-0.5" data-testid="reward-breakdown-preview">
          <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="font-medium tabular-nums">{currency} {breakdown.gross.toFixed(2)}</span></div>
          {breakdown.deductions.length > 0 && (
            <>
              {breakdown.deductions.map((d, i) => (
                <div key={i} className="flex justify-between text-rose-700 dark:text-rose-400">
                  <span className="truncate">− {d.name || '(unnamed)'}{d.type === 'percent' ? ` (${d.amount}%)` : ''}</span>
                  <span className="tabular-nums">−{currency} {d.computed.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-0.5 text-rose-700 dark:text-rose-400">
                <span>Total deductions</span>
                <span className="tabular-nums font-medium">−{currency} {breakdown.dedTotal.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t pt-0.5">
            <span className="font-semibold">Net (credited to wallet)</span>
            <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400" data-testid="text-reward-net">{currency} {breakdown.net.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact read-only breakdown — used in acknowledge dialog and approval panel. */
export function RewardBreakdownDisplay({
  grossAmount, currency, deductions, label = 'Completion Reward',
}: {
  grossAmount: number | null | undefined;
  currency: string;
  deductions: RewardDeduction[] | null | undefined;
  label?: string;
}) {
  const breakdown = useMemo(
    () => computeRewardBreakdown(grossAmount ?? 0, deductions ?? []),
    [grossAmount, deductions],
  );
  if (breakdown.gross <= 0) return null;
  return (
    <div className="rounded-lg border bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-xs space-y-1" data-testid="reward-breakdown-display">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
        <Trophy className="h-3 w-3" /> {label}
      </div>
      <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="font-medium tabular-nums">{currency} {breakdown.gross.toFixed(2)}</span></div>
      {breakdown.deductions.length > 0 && (
        <>
          {breakdown.deductions.map((d, i) => (
            <div key={i} className="flex justify-between text-rose-700 dark:text-rose-400">
              <span className="truncate">− {d.name || '(unnamed)'}{d.type === 'percent' ? ` (${d.amount}%)` : ''}</span>
              <span className="tabular-nums">−{currency} {d.computed.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 text-rose-700 dark:text-rose-400">
            <span>Total deductions</span>
            <span className="tabular-nums font-medium">−{currency} {breakdown.dedTotal.toFixed(2)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between border-t pt-1">
        <span className="font-semibold">Net to wallet</span>
        <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{currency} {breakdown.net.toFixed(2)}</span>
      </div>
    </div>
  );
}
