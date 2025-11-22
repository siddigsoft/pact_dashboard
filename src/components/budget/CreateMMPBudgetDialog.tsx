import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBudget } from '@/context/budget/BudgetContext';
import { DollarSign } from 'lucide-react';
import type { MMPBudget } from '@/types/budget';

interface CreateMMPBudgetDialogProps {
  mmpFileId: string;
  mmpName: string;
  projectId?: string;
  totalSites: number;
  onSuccess?: (budget: MMPBudget) => void;
  trigger?: React.ReactNode;
}

export function CreateMMPBudgetDialog({ 
  mmpFileId, 
  mmpName, 
  projectId, 
  totalSites,
  onSuccess,
  trigger
}: CreateMMPBudgetDialogProps) {
  const { createMMPBudget, projectBudgets } = useBudget();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [allocatedBudget, setAllocatedBudget] = useState('');
  const [sourceType, setSourceType] = useState<MMPBudget['sourceType']>('project_allocation');
  const [projectBudgetId, setProjectBudgetId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [categorySiteVisits, setCategorySiteVisits] = useState('');
  const [categoryTransportation, setCategoryTransportation] = useState('');
  const [categoryAccommodation, setCategoryAccommodation] = useState('');
  const [categoryMeals, setCategoryMeals] = useState('');
  const [categoryOther, setCategoryOther] = useState('');

  const availableProjectBudgets = projectId 
    ? projectBudgets.filter(pb => pb.projectId === projectId && pb.status === 'active')
    : [];

  useEffect(() => {
    if (availableProjectBudgets.length === 1) {
      setProjectBudgetId(availableProjectBudgets[0].id);
    }
  }, [availableProjectBudgets]);

  const handleSubmit = async () => {
    if (!allocatedBudget || parseFloat(allocatedBudget) <= 0) return;

    setLoading(true);
    try {
      const allocatedBudgetCents = Math.round(parseFloat(allocatedBudget) * 100);
      
      const categoryBreakdown = {
        site_visit_fees: categorySiteVisits ? Math.round(parseFloat(categorySiteVisits) * 100) : 0,
        transportation: categoryTransportation ? Math.round(parseFloat(categoryTransportation) * 100) : 0,
        accommodation: categoryAccommodation ? Math.round(parseFloat(categoryAccommodation) * 100) : 0,
        meals: categoryMeals ? Math.round(parseFloat(categoryMeals) * 100) : 0,
        other: categoryOther ? Math.round(parseFloat(categoryOther) * 100) : 0,
      };

      const result = await createMMPBudget({
        mmpFileId,
        projectBudgetId: sourceType === 'project_allocation' ? projectBudgetId : undefined,
        allocatedBudgetCents,
        totalSites,
        categoryBreakdown,
        sourceType,
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
    setAllocatedBudget('');
    setSourceType('project_allocation');
    setProjectBudgetId('');
    setNotes('');
    setCategorySiteVisits('');
    setCategoryTransportation('');
    setCategoryAccommodation('');
    setCategoryMeals('');
    setCategoryOther('');
  };

  const categoryTotal = [
    categorySiteVisits,
    categoryTransportation,
    categoryAccommodation,
    categoryMeals,
    categoryOther,
  ].reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  const averageCostPerSite = allocatedBudget && totalSites > 0 
    ? parseFloat(allocatedBudget) / totalSites 
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="button-create-mmp-budget">
            <DollarSign className="w-4 h-4 mr-2" />
            Allocate Budget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate Budget: {mmpName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="allocated-budget">Total Budget for MMP (SDG)</Label>
            <Input
              id="allocated-budget"
              type="number"
              min="0"
              step="0.01"
              value={allocatedBudget}
              onChange={(e) => setAllocatedBudget(e.target.value)}
              placeholder="100000.00"
              data-testid="input-allocated-budget"
            />
            {allocatedBudget && totalSites > 0 && (
              <p className="text-sm text-muted-foreground">
                Average per site: SDG {averageCostPerSite.toFixed(2)} ({totalSites} sites)
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="source-type">Budget Source</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as MMPBudget['sourceType'])}>
              <SelectTrigger id="source-type" data-testid="select-source-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_allocation">Project Allocation</SelectItem>
                <SelectItem value="top_up">Top-Up</SelectItem>
                <SelectItem value="additional_funding">Additional Funding</SelectItem>
                <SelectItem value="reallocation">Reallocation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceType === 'project_allocation' && availableProjectBudgets.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="project-budget">Project Budget</Label>
              <Select value={projectBudgetId} onValueChange={setProjectBudgetId}>
                <SelectTrigger id="project-budget" data-testid="select-project-budget">
                  <SelectValue placeholder="Select project budget" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjectBudgets.map((pb) => (
                    <SelectItem key={pb.id} value={pb.id}>
                      FY {pb.fiscalYear} - Remaining: SDG {(pb.remainingBudgetCents / 100).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {sourceType === 'project_allocation' && availableProjectBudgets.length === 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                No active project budgets available. Please create a project budget first.
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Category Breakdown (Optional)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cat-site-visits">Site Visit Fees (SDG)</Label>
                <Input
                  id="cat-site-visits"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categorySiteVisits}
                  onChange={(e) => setCategorySiteVisits(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-site-visits"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-transportation">Transportation (SDG)</Label>
                <Input
                  id="cat-transportation"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryTransportation}
                  onChange={(e) => setCategoryTransportation(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-transportation"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-accommodation">Accommodation (SDG)</Label>
                <Input
                  id="cat-accommodation"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryAccommodation}
                  onChange={(e) => setCategoryAccommodation(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-accommodation"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-meals">Meals (SDG)</Label>
                <Input
                  id="cat-meals"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryMeals}
                  onChange={(e) => setCategoryMeals(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-meals"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-other">Other Costs (SDG)</Label>
                <Input
                  id="cat-other"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryOther}
                  onChange={(e) => setCategoryOther(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-other"
                />
              </div>
            </div>

            {categoryTotal > 0 && (
              <div className="mt-3 p-3 bg-muted rounded-md">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Category Total:</span>
                  <span className="text-sm font-bold">
                    SDG {categoryTotal.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {allocatedBudget && categoryTotal > parseFloat(allocatedBudget) && (
                  <p className="text-sm text-destructive mt-1">
                    Category total exceeds budget by SDG {(categoryTotal - parseFloat(allocatedBudget)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Budget Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this MMP budget..."
              rows={3}
              data-testid="textarea-budget-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !allocatedBudget || 
              parseFloat(allocatedBudget) <= 0 || 
              loading ||
              (sourceType === 'project_allocation' && !projectBudgetId)
            }
            data-testid="button-submit"
          >
            {loading ? 'Allocating...' : 'Allocate Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
