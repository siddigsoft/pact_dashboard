import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useBudget } from '@/context/budget/BudgetContext';
import { Plus } from 'lucide-react';
import type { ProjectBudget } from '@/types/budget';

interface CreateProjectBudgetDialogProps {
  projectId: string;
  projectName: string;
  onSuccess?: (budget: ProjectBudget) => void;
}

export function CreateProjectBudgetDialog({ projectId, projectName, onSuccess }: CreateProjectBudgetDialogProps) {
  const { createProjectBudget } = useBudget();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [totalBudget, setTotalBudget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString());
  const [notes, setNotes] = useState('');

  const [categorySiteVisits, setCategorySiteVisits] = useState('');
  const [categoryTransportation, setCategoryTransportation] = useState('');
  const [categoryAccommodation, setCategoryAccommodation] = useState('');
  const [categoryMeals, setCategoryMeals] = useState('');
  const [categoryEquipment, setCategoryEquipment] = useState('');
  const [categoryOther, setCategoryOther] = useState('');

  const handleSubmit = async () => {
    if (!totalBudget || parseFloat(totalBudget) <= 0) return;

    setLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);
      
      const categoryAllocations = {
        site_visits: categorySiteVisits ? Math.round(parseFloat(categorySiteVisits) * 100) : 0,
        transportation: categoryTransportation ? Math.round(parseFloat(categoryTransportation) * 100) : 0,
        accommodation: categoryAccommodation ? Math.round(parseFloat(categoryAccommodation) * 100) : 0,
        meals: categoryMeals ? Math.round(parseFloat(categoryMeals) * 100) : 0,
        equipment: categoryEquipment ? Math.round(parseFloat(categoryEquipment) * 100) : 0,
        other: categoryOther ? Math.round(parseFloat(categoryOther) * 100) : 0,
      };

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
    setTotalBudget('');
    setBudgetPeriod('annual');
    setFiscalYear(new Date().getFullYear().toString());
    setNotes('');
    setCategorySiteVisits('');
    setCategoryTransportation('');
    setCategoryAccommodation('');
    setCategoryMeals('');
    setCategoryEquipment('');
    setCategoryOther('');
  };

  const categoryTotal = [
    categorySiteVisits,
    categoryTransportation,
    categoryAccommodation,
    categoryMeals,
    categoryEquipment,
    categoryOther,
  ].reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-project-budget">
          <Plus className="w-4 h-4 mr-2" />
          Create Budget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Project Budget: {projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="total-budget">Total Budget (SDG)</Label>
              <Input
                id="total-budget"
                type="number"
                min="0"
                step="0.01"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                placeholder="500000.00"
                data-testid="input-total-budget"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="budget-period">Budget Period</Label>
              <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as ProjectBudget['budgetPeriod'])}>
                <SelectTrigger id="budget-period" data-testid="select-budget-period">
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
              <Label htmlFor="fiscal-year">Fiscal Year</Label>
              <Input
                id="fiscal-year"
                type="number"
                min="2020"
                max="2050"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                data-testid="input-fiscal-year"
              />
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Category Allocations (Optional)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cat-site-visits">Site Visits (SDG)</Label>
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
                <Label htmlFor="cat-equipment">Equipment (SDG)</Label>
                <Input
                  id="cat-equipment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryEquipment}
                  onChange={(e) => setCategoryEquipment(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-equipment"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-other">Other (SDG)</Label>
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
                  <span className="text-sm font-medium">Total Allocated:</span>
                  <span className="text-sm font-bold">
                    SDG {categoryTotal.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {totalBudget && categoryTotal > parseFloat(totalBudget) && (
                  <p className="text-sm text-destructive mt-1">
                    Category total exceeds budget by SDG {(categoryTotal - parseFloat(totalBudget)).toFixed(2)}
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
              placeholder="Additional notes about this budget..."
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
            disabled={!totalBudget || parseFloat(totalBudget) <= 0 || loading}
            data-testid="button-submit"
          >
            {loading ? 'Creating...' : 'Create Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
