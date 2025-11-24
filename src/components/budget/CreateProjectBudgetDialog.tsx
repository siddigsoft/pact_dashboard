import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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

  const [categoryTransportAndVisit, setCategoryTransportAndVisit] = useState('');
  const [categoryPermitFee, setCategoryPermitFee] = useState('');
  const [categoryInternetComm, setCategoryInternetComm] = useState('');

  const handleSubmit = async () => {
    if (!totalBudget || parseFloat(totalBudget) <= 0) return;

    setLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);
      
      const categoryAllocations = {
        transportation_and_visit_fees: categoryTransportAndVisit ? Math.round(parseFloat(categoryTransportAndVisit) * 100) : 0,
        permit_fee: categoryPermitFee ? Math.round(parseFloat(categoryPermitFee) * 100) : 0,
        internet_and_communication_fees: categoryInternetComm ? Math.round(parseFloat(categoryInternetComm) * 100) : 0,
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
    setCategoryTransportAndVisit('');
    setCategoryPermitFee('');
    setCategoryInternetComm('');
  };

  const categoryTotal = [
    categoryTransportAndVisit,
    categoryPermitFee,
    categoryInternetComm,
  ].reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-4 py-2 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition inline-flex items-center"
          data-testid="button-create-project-budget"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Budget
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
        <DialogHeader>
          <DialogTitle className="text-cyan-100">Create Project Budget: {projectName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 cyber-dialog-form">
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

          <div className="border-t border-cyan-500/20 pt-4">
            <h4 className="font-medium mb-3 text-cyan-100">Category Allocations (Optional)</h4>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cat-transport-visit">Transportation and Visit Fees (SDG)</Label>
                <Input
                  id="cat-transport-visit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryTransportAndVisit}
                  onChange={(e) => setCategoryTransportAndVisit(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-transport-visit"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-permit-fee">Permit Fee (SDG)</Label>
                <Input
                  id="cat-permit-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryPermitFee}
                  onChange={(e) => setCategoryPermitFee(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-permit-fee"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cat-internet-comm">Internet & Communication Fees (SDG)</Label>
                <Input
                  id="cat-internet-comm"
                  type="number"
                  min="0"
                  step="0.01"
                  value={categoryInternetComm}
                  onChange={(e) => setCategoryInternetComm(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-category-internet-comm"
                />
              </div>
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

        <div className="flex gap-3 justify-end pt-4 border-t border-cyan-500/20">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-transparent border border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/20 shadow-[0_0_12px_rgba(6,182,212,0.25)] focus:outline-none focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!totalBudget || parseFloat(totalBudget) <= 0 || loading}
            className="px-4 py-2 rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white border border-cyan-400/50 shadow-[0_0_18px_rgba(6,182,212,0.35)] focus:outline-none focus:ring-2 focus:ring-cyan-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="button-submit"
          >
            {loading ? 'Creating...' : 'Create Budget'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
