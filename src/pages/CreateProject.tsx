
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ProjectForm from '@/components/project/ProjectForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { Project } from '@/types/project';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectBudget } from '@/types/budget';

const CreateProject = () => {
  const navigate = useNavigate();
  const { addProject } = useProjectContext();
  const { createProjectBudget } = useBudget();
  
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  
  // Budget form state
  const [totalBudget, setTotalBudget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString());
  const [budgetNotes, setBudgetNotes] = useState('');
  const [categoryTransport, setCategoryTransport] = useState('');
  const [categoryPermit, setCategoryPermit] = useState('');
  const [categoryInternet, setCategoryInternet] = useState('');

  const handleProjectSubmit = async (project: Project) => {
    const newProject = await addProject(project);
    if (newProject) {
      setCreatedProject(newProject);
      setShowBudgetDialog(true);
    }
  };

  const handleDialogChange = (open: boolean) => {
    // Prevent closing dialog - budget is mandatory
    // Only allow closing after budget is created (which navigates away)
    if (!open) {
      return;
    }
    setShowBudgetDialog(open);
  };

  const handleCreateBudget = async () => {
    if (!createdProject || !totalBudget || parseFloat(totalBudget) <= 0) {
      console.warn('Budget creation validation failed:', { createdProject, totalBudget });
      return;
    }

    setBudgetLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);
      
      const categoryAllocations = {
        transportation_and_visit_fees: categoryTransport ? Math.round(parseFloat(categoryTransport) * 100) : 0,
        permit_fee: categoryPermit ? Math.round(parseFloat(categoryPermit) * 100) : 0,
        internet_and_communication_fees: categoryInternet ? Math.round(parseFloat(categoryInternet) * 100) : 0,
      };

      const periodStart = budgetPeriod === 'annual' 
        ? `${fiscalYear}-01-01` 
        : budgetPeriod === 'monthly'
        ? new Date().toISOString().split('T')[0]
        : budgetPeriod === 'quarterly'
        ? new Date().toISOString().split('T')[0]
        : undefined;

      const periodEnd = budgetPeriod === 'annual'
        ? `${fiscalYear}-12-31`
        : budgetPeriod === 'monthly'
        ? new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
        : budgetPeriod === 'quarterly'
        ? new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0]
        : undefined;

      const budgetInput = {
        projectId: createdProject.id,
        totalBudgetCents,
        budgetPeriod,
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
        categoryAllocations,
        fiscalYear: parseInt(fiscalYear),
        budgetNotes,
      };

      console.log('Creating budget with data:', budgetInput);

      const result = await createProjectBudget(budgetInput);
      
      if (result) {
        console.log('Budget created successfully:', result);
        setShowBudgetDialog(false);
        navigate(`/projects/${createdProject.id}`);
      } else {
        console.error('Budget creation returned null');
      }
    } catch (error) {
      console.error('Error creating budget:', error);
    } finally {
      setBudgetLoading(false);
    }
  };

  const categoryTotal = [categoryTransport, categoryPermit, categoryInternet]
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/projects")}
            className="hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create New Project</h1>
            <p className="text-muted-foreground">
              Set up a new project in the planning system
            </p>
          </div>
        </div>

        <ProjectForm onSubmit={handleProjectSubmit} />
      </div>

      {/* Budget Creation Dialog - Mandatory */}
      <Dialog open={showBudgetDialog} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" hideCloseButton>
          <DialogHeader>
            <DialogTitle>Create Budget for {createdProject?.name}</DialogTitle>
            <DialogDescription>
              A budget is required for all projects. Please set up the budget to continue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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
                  data-testid="input-project-total-budget"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="budget-period">Budget Period</Label>
                <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as ProjectBudget['budgetPeriod'])}>
                  <SelectTrigger id="budget-period">
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
                />
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Category Allocations (Optional)</h4>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cat-transport">Transportation and Visit Fees (SDG)</Label>
                  <Input
                    id="cat-transport"
                    type="number"
                    min="0"
                    step="0.01"
                    value={categoryTransport}
                    onChange={(e) => setCategoryTransport(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cat-permit">Permit Fee (SDG)</Label>
                  <Input
                    id="cat-permit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={categoryPermit}
                    onChange={(e) => setCategoryPermit(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cat-internet">Internet & Communication Fees (SDG)</Label>
                  <Input
                    id="cat-internet"
                    type="number"
                    min="0"
                    step="0.01"
                    value={categoryInternet}
                    onChange={(e) => setCategoryInternet(e.target.value)}
                    placeholder="0.00"
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
              <Label htmlFor="budget-notes">Budget Notes</Label>
              <Textarea
                id="budget-notes"
                value={budgetNotes}
                onChange={(e) => setBudgetNotes(e.target.value)}
                placeholder="Additional notes about this budget..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              onClick={handleCreateBudget} 
              disabled={!totalBudget || parseFloat(totalBudget) <= 0 || budgetLoading}
              data-testid="button-create-project-budget"
            >
              {budgetLoading ? 'Creating...' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreateProject;
