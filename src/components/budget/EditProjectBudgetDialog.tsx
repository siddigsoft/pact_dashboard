import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/context/budget/BudgetContext';
import { dispatchNotification } from '@/lib/notify';
import { Loader2, Plus, Trash2, RefreshCw } from 'lucide-react';
import type { ProjectBudget } from '@/types/budget';

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
}

/**
 * Maps every known legacy budget category key to its nearest canonical new key.
 * Keys that already use a canonical key (personnel_labor_fees, etc.) are not listed —
 * they pass through the `LEGACY_KEY_MAP[key] ?? key` lookup unchanged.
 * When two legacy keys share the same canonical target, the useEffect merges their
 * amounts into one line item so admins never see two rows with identical labels.
 *
 * Source of truth: all `key:` values in src/config/projectTypeConfig.ts +
 * legacy keys observed in src/components/budget/BudgetCard.tsx and
 * src/components/project/ProjectCostTab.tsx.
 */
const LEGACY_KEY_MAP: Record<string, string> = {
  // ── Transportation ────────────────────────────────────────────────────────
  transportation_and_visit_fees:  'transportation_logistics',
  transportation:                 'transportation_logistics',
  transport:                      'transportation_logistics',
  vehicle:                        'transportation_logistics',
  site_visits:                    'transportation_logistics',

  // ── Personnel / labor ────────────────────────────────────────────────────
  professional_fees:              'personnel_labor_fees',
  personnel_fees:                 'personnel_labor_fees',
  enumerator_fees:                'personnel_labor_fees',
  supervisor_fees:                'personnel_labor_fees',
  supervision_fees:               'personnel_labor_fees',
  contractor_fees:                'personnel_labor_fees',
  facilitator_fees:               'personnel_labor_fees',
  evaluation_team_fees:           'personnel_labor_fees',
  reviewer_fees:                  'personnel_labor_fees',
  review_fees:                    'personnel_labor_fees',
  proposal_writing_fees:          'personnel_labor_fees',
  key_informant_incentives:       'personnel_labor_fees',
  incentives:                     'personnel_labor_fees',
  allowances:                     'personnel_labor_fees',
  per_diem:                       'personnel_labor_fees',

  // ── Equipment / supplies ─────────────────────────────────────────────────
  equipment:                      'equipment_supplies',
  supplies:                       'equipment_supplies',
  materials:                      'equipment_supplies',
  data_collection_tools:          'equipment_supplies',
  printing:                       'equipment_supplies',
  printing_and_materials:         'equipment_supplies',
  training_materials:             'equipment_supplies',
  publication_costs:              'equipment_supplies',

  // ── Field ops / activities ───────────────────────────────────────────────
  accommodation:                  'field_operations_activities',
  catering:                       'field_operations_activities',
  meals:                          'field_operations_activities',
  training:                       'field_operations_activities',
  meetings:                       'field_operations_activities',
  field_operations:               'field_operations_activities',
  report_production:              'field_operations_activities',
  venue_costs:                    'field_operations_activities',
  workshop_facilitation:          'field_operations_activities',
  construction_costs:             'field_operations_activities',
  research_protocol_costs:        'field_operations_activities',

  // ── Internet / comms ─────────────────────────────────────────────────────
  internet_and_communication_fees: 'internet_communication',
  communications:                 'internet_communication',
  communication:                  'internet_communication',

  // ── Permits / legal ──────────────────────────────────────────────────────
  permit_fee:                     'permits_taxes_legal',
  permits:                        'permits_taxes_legal',

  // ── Overhead / admin ─────────────────────────────────────────────────────
  management_overhead_legacy:     'management_overhead',
  overhead:                       'management_overhead',
  data_management:                'management_overhead',
  document_management:            'management_overhead',

  // ── Contingency / catch-all ──────────────────────────────────────────────
  contingency:                    'contingency_reserve',
  miscellaneous:                  'contingency_reserve',
  other:                          'contingency_reserve',
};

const CATEGORY_OPTIONS = [
  { value: 'personnel_labor_fees', label: 'Personnel & Labor Fees' },
  { value: 'transportation_logistics', label: 'Transportation & Logistics' },
  { value: 'equipment_supplies', label: 'Equipment & Supplies' },
  { value: 'field_operations_activities', label: 'Field Operations & Activities' },
  { value: 'internet_communication', label: 'Internet & Communication' },
  { value: 'permits_taxes_legal', label: 'Permits, Taxes & Legal Fees' },
  { value: 'management_overhead', label: 'Management & Overhead' },
  { value: 'contingency_reserve', label: 'Contingency / Reserve' },
];

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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className=""
                data-testid="button-add-line-item"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
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
