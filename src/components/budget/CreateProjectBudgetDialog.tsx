import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/context/budget/BudgetContext';
import { Plus, Loader2 } from 'lucide-react';
import type { ProjectBudget } from '@/types/budget';

interface CreateProjectBudgetDialogProps {
  projectId: string;
  projectName: string;
  /** Pre-fill total from project.budget.total */
  initialAmount?: number;
  /** Currency label to show (e.g. 'USD', 'SDG') */
  initialCurrency?: string;
  /** Whether the dialog is controlled externally */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  trigger?: React.ReactNode;
  onSuccess?: (budget: ProjectBudget) => void;
}

const CATEGORY_OPTIONS = [
  { value: 'professional_fees', label: 'Professional Fees' },
  { value: 'transportation_and_visit_fees', label: 'Transportation and Visit Fees' },
  { value: 'permit_fee', label: 'Permit Fee' },
  { value: 'internet_and_communication_fees', label: 'Internet & Communication Fees' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'training', label: 'Training' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other', label: 'Other' },
];

interface LineItem {
  id: string;
  category: string;
  amount: string;
}

export function CreateProjectBudgetDialog({
  projectId,
  projectName,
  initialAmount,
  initialCurrency = 'SDG',
  open: openProp,
  onOpenChange,
  trigger,
  onSuccess,
}: CreateProjectBudgetDialogProps) {
  const { createProjectBudget } = useBudget();
  const [openInternal, setOpenInternal] = useState(false);
  const [loading, setLoading] = useState(false);

  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = isControlled
    ? (v: boolean) => onOpenChange?.(v)
    : (v: boolean) => setOpenInternal(v);

  const [totalBudget, setTotalBudget] = useState(() =>
    initialAmount != null && initialAmount > 0 ? initialAmount.toString() : '',
  );
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('project_lifetime');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString());
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), category: '', amount: '' },
  ]);

  const addLineItem = () =>
    setLineItems(prev => [...prev, { id: crypto.randomUUID(), category: '', amount: '' }]);

  const removeLineItem = (id: string) =>
    setLineItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

  const updateLineItem = (id: string, field: keyof LineItem, value: string) =>
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const handleSubmit = async () => {
    if (!totalBudget || parseFloat(totalBudget) <= 0) return;
    setLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);

      const categoryAllocations: Record<string, number> = {};
      lineItems.forEach(item => {
        if (item.category && item.amount && parseFloat(item.amount) > 0) {
          const cents = Math.round(parseFloat(item.amount) * 100);
          categoryAllocations[item.category] = (categoryAllocations[item.category] || 0) + cents;
        }
      });

      const periodStart = budgetPeriod === 'annual'
        ? `${fiscalYear}-01-01`
        : budgetPeriod === 'monthly'
        ? new Date().toISOString().split('T')[0]
        : undefined;

      const periodEnd = budgetPeriod === 'annual'
        ? `${fiscalYear}-12-31`
        : budgetPeriod === 'monthly'
        ? new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
        : undefined;

      const result = await createProjectBudget({
        projectId,
        totalBudgetCents,
        budgetPeriod,
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
        categoryAllocations,
        fiscalYear: parseInt(fiscalYear),
        budgetNotes: notes,
      });

      if (result) {
        setOpen(false);
        resetForm();
        onSuccess?.(result);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTotalBudget(initialAmount != null && initialAmount > 0 ? initialAmount.toString() : '');
    setBudgetPeriod('project_lifetime');
    setFiscalYear(new Date().getFullYear().toString());
    setNotes('');
    setLineItems([{ id: crypto.randomUUID(), category: '', amount: '' }]);
  };

  const categoryTotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const usedCategories = lineItems.map(i => i.category).filter(Boolean);

  const defaultTrigger = (
    <button
      type="button"
      className="px-4 py-2 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:outline-none focus:ring-2 focus:ring-blue-400/70 transition inline-flex items-center"
      data-testid="button-create-project-budget"
    >
      <Plus className="w-4 h-4 mr-2" />
      Create Budget
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (trigger ?? defaultTrigger)}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
        <DialogHeader>
          <DialogTitle className="text-cyan-100">Create Budget: {projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Reference banner when pre-filled */}
          {initialAmount != null && initialAmount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900/40 border border-blue-500/40 text-sm text-blue-200">
              <span className="shrink-0">📌</span>
              <span>
                Project funding: <strong>{initialCurrency} {initialAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.
                This budget tracks operational spending in {initialCurrency}.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="total-budget" className="text-cyan-200">
                Total Budget ({initialCurrency})
              </Label>
              <Input
                id="total-budget"
                type="number"
                min="0"
                step="0.01"
                value={totalBudget}
                onChange={e => setTotalBudget(e.target.value)}
                placeholder="0.00"
                className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                data-testid="input-total-budget"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="budget-period" className="text-cyan-200">Budget Period</Label>
              <Select value={budgetPeriod} onValueChange={v => setBudgetPeriod(v as ProjectBudget['budgetPeriod'])}>
                <SelectTrigger id="budget-period" className="bg-slate-800/50 border-blue-500/30 text-cyan-100" data-testid="select-budget-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project_lifetime">Project Lifetime</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(budgetPeriod === 'annual' || budgetPeriod === 'quarterly') && (
            <div className="grid gap-2">
              <Label htmlFor="fiscal-year" className="text-cyan-200">Fiscal Year</Label>
              <Input
                id="fiscal-year"
                type="number"
                min="2020"
                max="2050"
                value={fiscalYear}
                onChange={e => setFiscalYear(e.target.value)}
                className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                data-testid="input-fiscal-year"
              />
            </div>
          )}

          {/* Line items */}
          <div className="border-t border-cyan-500/20 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-cyan-100">Budget Line Items (Optional)</h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/20"
                data-testid="button-add-line-item"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[1fr_140px_36px] gap-2 items-end">
                  <div className="grid gap-1">
                    {index === 0 && <Label className="text-xs text-cyan-300/70">Category</Label>}
                    <Select value={item.category} onValueChange={v => updateLineItem(item.id, 'category', v)}>
                      <SelectTrigger className="bg-slate-800/50 border-blue-500/30 text-cyan-100" data-testid={`select-category-${index}`}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map(opt => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            disabled={usedCategories.includes(opt.value) && item.category !== opt.value}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    {index === 0 && <Label className="text-xs text-cyan-300/70">Amount ({initialCurrency})</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={e => updateLineItem(item.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                      data-testid={`input-amount-${index}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded disabled:opacity-40"
                    data-testid={`button-remove-item-${index}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {categoryTotal > 0 && (
              <div className="mt-3 p-3 rounded-md bg-cyan-900/20 border border-cyan-500/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-cyan-200">Total Allocated:</span>
                  <span className="text-sm font-bold text-cyan-100">
                    {initialCurrency} {categoryTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {totalBudget && categoryTotal > parseFloat(totalBudget) && (
                  <p className="text-sm text-red-300 mt-1">
                    Category total exceeds budget by {initialCurrency} {(categoryTotal - parseFloat(totalBudget)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes" className="text-cyan-200">Budget Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes about this budget..."
              rows={3}
              className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
              data-testid="textarea-budget-notes"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-cyan-500/20">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/20"
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!totalBudget || parseFloat(totalBudget) <= 0 || loading}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white border border-cyan-400/50"
            data-testid="button-submit"
          >
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
