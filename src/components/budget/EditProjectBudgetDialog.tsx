import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/context/budget/BudgetContext';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { ProjectBudget } from '@/types/budget';

interface BudgetLineItem {
  id: string;
  category: string;
  amount: string;
}

interface EditProjectBudgetDialogProps {
  budget: ProjectBudget;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORY_OPTIONS = [
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

export function EditProjectBudgetDialog({ 
  budget, 
  projectName, 
  open, 
  onOpenChange,
  onSuccess 
}: EditProjectBudgetDialogProps) {
  const { updateProjectBudget } = useBudget();
  const [loading, setLoading] = useState(false);

  const [totalBudget, setTotalBudget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);

  useEffect(() => {
    if (open && budget) {
      setTotalBudget((budget.totalBudgetCents / 100).toString());
      setBudgetPeriod(budget.budgetPeriod);
      setFiscalYear(budget.fiscalYear?.toString() || new Date().getFullYear().toString());
      setNotes(budget.budgetNotes || '');
      
      const items: BudgetLineItem[] = [];
      if (budget.categoryAllocations) {
        Object.entries(budget.categoryAllocations).forEach(([category, amountCents]) => {
          if (typeof amountCents === 'number' && amountCents > 0) {
            items.push({
              id: crypto.randomUUID(),
              category,
              amount: (amountCents / 100).toString(),
            });
          }
        });
      }
      if (items.length === 0) {
        items.push({ id: crypto.randomUUID(), category: '', amount: '' });
      }
      setLineItems(items);
    }
  }, [open, budget]);

  const addLineItem = () => {
    setLineItems([...lineItems, { id: crypto.randomUUID(), category: '', amount: '' }]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: 'category' | 'amount', value: string) => {
    setLineItems(lineItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = async () => {
    if (!totalBudget || parseFloat(totalBudget) <= 0) return;

    setLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);
      
      const categoryAllocations: Record<string, number> = {};
      lineItems.forEach(item => {
        if (item.category && item.amount && parseFloat(item.amount) > 0) {
          const amountCents = Math.round(parseFloat(item.amount) * 100);
          if (categoryAllocations[item.category]) {
            categoryAllocations[item.category] += amountCents;
          } else {
            categoryAllocations[item.category] = amountCents;
          }
        }
      });

      const allocatedCents = Object.values(categoryAllocations).reduce((sum, val) => sum + val, 0);

      await updateProjectBudget(budget.id, {
        totalBudgetCents,
        allocatedBudgetCents: allocatedCents,
        remainingBudgetCents: totalBudgetCents - budget.spentBudgetCents,
        budgetPeriod,
        fiscalYear: parseInt(fiscalYear),
        budgetNotes: notes,
        categoryAllocations: categoryAllocations as any,
      });

      onOpenChange(false);
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  const categoryTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const usedCategories = lineItems.map(item => item.category).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
        <DialogHeader>
          <DialogTitle className="text-cyan-100">Edit Budget: {projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-total-budget" className="text-cyan-200">Total Budget (SDG)</Label>
              <Input
                id="edit-total-budget"
                type="number"
                min="0"
                step="0.01"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                placeholder="500000.00"
                className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                data-testid="input-edit-total-budget"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-budget-period" className="text-cyan-200">Budget Period</Label>
              <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as ProjectBudget['budgetPeriod'])}>
                <SelectTrigger id="edit-budget-period" className="bg-slate-800/50 border-blue-500/30 text-cyan-100" data-testid="select-edit-budget-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="project_lifetime">Project Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(budgetPeriod === 'annual' || budgetPeriod === 'quarterly') && (
            <div className="grid gap-2">
              <Label htmlFor="edit-fiscal-year" className="text-cyan-200">Fiscal Year</Label>
              <Input
                id="edit-fiscal-year"
                type="number"
                min="2020"
                max="2050"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                data-testid="input-edit-fiscal-year"
              />
            </div>
          )}

          <div className="border-t border-cyan-500/20 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-cyan-100">Budget Line Items</h4>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addLineItem}
                className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/20"
                data-testid="button-add-line-item"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            
            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[1fr_120px_40px] gap-2 items-end">
                  <div className="grid gap-1">
                    {index === 0 && <Label className="text-xs text-cyan-300/70">Category</Label>}
                    <Select 
                      value={item.category} 
                      onValueChange={(v) => updateLineItem(item.id, 'category', v)}
                    >
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
                    {index === 0 && <Label className="text-xs text-cyan-300/70">Amount (SDG)</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => updateLineItem(item.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
                      data-testid={`input-amount-${index}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    data-testid={`button-remove-item-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {categoryTotal > 0 && (
              <div className="mt-3 p-3 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 backdrop-blur-sm border border-cyan-500/30 rounded-md shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-cyan-200">Total Allocated:</span>
                  <span className="text-sm font-bold text-cyan-100">
                    SDG {categoryTotal.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {totalBudget && categoryTotal > parseFloat(totalBudget) && (
                  <p className="text-sm text-red-300 mt-1">
                    Category total exceeds budget by SDG {(categoryTotal - parseFloat(totalBudget)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-notes" className="text-cyan-200">Budget Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this budget..."
              rows={3}
              className="bg-slate-800/50 border-blue-500/30 text-cyan-100"
              data-testid="textarea-edit-budget-notes"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-cyan-500/20">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/20"
            data-testid="button-edit-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!totalBudget || parseFloat(totalBudget) <= 0 || loading}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white border border-cyan-400/50"
            data-testid="button-edit-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
