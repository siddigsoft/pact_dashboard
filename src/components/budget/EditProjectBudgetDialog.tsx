import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/context/budget/BudgetContext';
import { dispatchNotification } from '@/lib/notify';
import { Loader2, Plus, Trash2, RefreshCw, Users } from 'lucide-react';
import type { ProjectBudget } from '@/types/budget';
import type { ProjectTeamMember } from '@/types/project';
import { calcMemberTotalCost } from '@/types/project';
import { LEGACY_KEY_MAP, CATEGORY_OPTIONS } from '@/config/budgetCategoryMaps';

interface BudgetLineItem {
  id: string;
  category: string;
  amount: string;
}

interface EditProjectBudgetDialogProps {
  budget: ProjectBudget;
  projectName: string;
  /** Original project currency from project.budget for reference display */
  projectCurrency?: string;
  /** Original project total from project.budget for reference display */
  projectTotalAmount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** ID of the project manager — used to dispatch edit notification */
  projectManagerId?: string;
  /** Current user info for notification dispatch */
  currentUserId?: string;
  currentUserName?: string;
  /** Team composition from projects.team.teamComposition — used by "Import Team Fees" */
  teamComposition?: ProjectTeamMember[];
}
export function EditProjectBudgetDialog({
  budget,
  projectName,
  projectCurrency,
  projectTotalAmount,
  open,
  onOpenChange,
  onSuccess,
  projectManagerId,
  currentUserId,
  currentUserName,
  teamComposition = [],
}: EditProjectBudgetDialogProps) {
  const { updateProjectBudget } = useBudget();
  const [loading, setLoading] = useState(false);

  const [totalBudget, setTotalBudget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);

  const displayCurrency = projectCurrency || 'SDG';

  useEffect(() => {
    if (open && budget) {
      setTotalBudget((budget.totalBudgetCents / 100).toString());
      setBudgetPeriod(budget.budgetPeriod);
      setFiscalYear(budget.fiscalYear?.toString() || new Date().getFullYear().toString());
      setNotes(budget.budgetNotes || '');

      const items: BudgetLineItem[] = [];
      if (budget.categoryAllocations) {
        // Merge allocations, normalising legacy keys to canonical new keys
        const merged: Record<string, number> = {};
        Object.entries(budget.categoryAllocations).forEach(([category, amountCents]) => {
          if (typeof amountCents === 'number' && amountCents > 0) {
            const canonical = LEGACY_KEY_MAP[category] ?? category;
            merged[canonical] = (merged[canonical] ?? 0) + amountCents;
          }
        });
        Object.entries(merged).forEach(([category, amountCents]) => {
          items.push({ id: crypto.randomUUID(), category, amount: (amountCents / 100).toString() });
        });
      }
      if (items.length === 0) {
        items.push({ id: crypto.randomUUID(), category: '', amount: '' });
      }
      setLineItems(items);
    }
  }, [open, budget]);

  const addLineItem = () => setLineItems(prev => [...prev, { id: crypto.randomUUID(), category: '', amount: '' }]);
  const removeLineItem = (id: string) => { if (lineItems.length > 1) setLineItems(prev => prev.filter(i => i.id !== id)); };
  const updateLineItem = (id: string, field: 'category' | 'amount', value: string) =>
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const syncFromProjectFunding = () => {
    if (projectTotalAmount != null && projectTotalAmount > 0) {
      setTotalBudget(projectTotalAmount.toString());
    }
  };

  /** Compute sum of all team member fees and upsert into the personnel_labor_fees line item. */
  const importTeamFees = () => {
    if (!teamComposition.length) return;
    const projectTotal = projectTotalAmount || parseFloat(totalBudget) || 0;
    const totalTeamFees = teamComposition.reduce((sum, member) => {
      if (!member.feeType) return sum;
      return sum + calcMemberTotalCost(member, projectTotal);
    }, 0);
    if (totalTeamFees <= 0) return;
    const rounded = parseFloat(totalTeamFees.toFixed(2));

    setLineItems(prev => {
      const existing = prev.find(i => i.category === 'personnel_labor_fees');
      if (existing) {
        return prev.map(i =>
          i.category === 'personnel_labor_fees' ? { ...i, amount: rounded.toString() } : i
        );
      }
      // Append a new personnel_labor_fees line if absent
      const withoutEmpty = prev.filter(i => i.category !== '');
      return [
        ...withoutEmpty,
        { id: crypto.randomUUID(), category: 'personnel_labor_fees', amount: rounded.toString() },
      ];
    });
  };

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
      const allocatedCents = Object.values(categoryAllocations).reduce((s, v) => s + v, 0);
      await updateProjectBudget(budget.id, {
        totalBudgetCents,
        allocatedBudgetCents: allocatedCents,
        remainingBudgetCents: totalBudgetCents - budget.spentBudgetCents,
        budgetPeriod,
        fiscalYear: parseInt(fiscalYear),
        budgetNotes: notes,
        categoryAllocations: categoryAllocations as any,
      });
      // Notify project manager of budget edit
      if (projectManagerId && currentUserId) {
        dispatchNotification({
          event: 'budget_updated',
          recipientIds: [projectManagerId],
          titleEn: 'Project Budget Updated',
          titleAr: 'تم تحديث ميزانية المشروع',
          messageEn: `The budget for project "${projectName}" was updated by ${currentUserName || 'an admin'}. New total: ${displayCurrency} ${(totalBudgetCents / 100).toLocaleString()}.`,
          messageAr: `تم تحديث ميزانية مشروع "${projectName}".`,
          entityType: 'project_budget',
          entityId: budget.id,
          sendEmail: false,
        }).catch(() => {});
      }
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  const categoryTotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const usedCategories = lineItems.map(i => i.category).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Budget: {projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Reference banner showing project creation budget */}
          {projectTotalAmount != null && projectTotalAmount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
              <span className="shrink-0">📌</span>
              <span>
                Original project funding: <strong>{displayCurrency} {projectTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-total-budget">
                  Total Budget ({displayCurrency})
                </Label>
                {projectTotalAmount != null && projectTotalAmount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={syncFromProjectFunding}
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    data-testid="button-sync-project-funding"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Sync from project ({displayCurrency} {projectTotalAmount.toLocaleString()})
                  </Button>
                )}
              </div>
              <Input
                id="edit-total-budget"
                type="number"
                min="0"
                step="0.01"
                value={totalBudget}
                onChange={e => setTotalBudget(e.target.value)}
                placeholder="0.00"
                className=""
                data-testid="input-edit-total-budget"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-budget-period">Budget Period</Label>
              <Select value={budgetPeriod} onValueChange={v => setBudgetPeriod(v as ProjectBudget['budgetPeriod'])}>
                <SelectTrigger id="edit-budget-period" className="" data-testid="select-edit-budget-period">
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
              <Label htmlFor="edit-fiscal-year">Fiscal Year</Label>
              <Input
                id="edit-fiscal-year"
                type="number"
                min="2020"
                max="2050"
                value={fiscalYear}
                onChange={e => setFiscalYear(e.target.value)}
                className=""
                data-testid="input-edit-fiscal-year"
              />
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Budget Line Items</h4>
              <div className="flex items-center gap-2">
                {teamComposition.length > 0 && (() => {
                  const projectTotal = projectTotalAmount || parseFloat(totalBudget) || 0;
                  const teamTotal = teamComposition.reduce((s, m) => {
                    if (!m.feeType) return s;
                    return s + calcMemberTotalCost(m, projectTotal);
                  }, 0);
                  return teamTotal > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={importTeamFees}
                      className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950/30"
                      data-testid="button-import-team-fees"
                    >
                      <Users className="w-3.5 h-3.5 mr-1" />
                      Import Team Fees ({displayCurrency} {teamTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                    </Button>
                  ) : null;
                })()}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLineItem}
                  data-testid="button-add-line-item"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[1fr_140px_40px] gap-2 items-end">
                  <div className="grid gap-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Category</Label>}
                    <Select value={item.category} onValueChange={v => updateLineItem(item.id, 'category', v)}>
                      <SelectTrigger className="" data-testid={`select-category-${index}`}>
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
                    {index === 0 && <Label className="text-xs text-muted-foreground">Amount ({displayCurrency})</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={e => updateLineItem(item.id, 'amount', e.target.value)}
                      placeholder="0.00"
                      className=""
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
              <div className="mt-3 p-3 rounded-md bg-muted/40 border">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Total Allocated:</span>
                  <span className="text-sm font-bold">
                    {displayCurrency} {categoryTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {totalBudget && categoryTotal > parseFloat(totalBudget) && (
                  <p className="text-sm text-red-600 mt-1">
                    Category total exceeds budget by {displayCurrency} {(categoryTotal - parseFloat(totalBudget)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Budget Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes about this budget..."
              rows={3}
              className=""
              data-testid="textarea-edit-budget-notes"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-testid="button-edit-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!totalBudget || parseFloat(totalBudget) <= 0 || loading}
            data-testid="button-edit-submit"
          >
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
