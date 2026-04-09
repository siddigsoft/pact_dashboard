
import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Handshake } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ProjectForm from '@/components/project/ProjectForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { Project, ProjectType } from '@/types/project';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectBudget } from '@/types/budget';
import { getProjectTypeConfig } from '@/config/projectTypeConfig';

const CreateProject = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Task #13: Template-based prefill
  const templateType = searchParams.get('template') as ProjectType | null;

  const { addProject } = useProjectContext();
  const { createProjectBudget } = useBudget();

  // Task #14: CRM opportunity prefill
  const crmOpportunityId = searchParams.get('crm_opportunity_id') || undefined;
  const crmOpportunityTitle = searchParams.get('crm_opportunity_title') || undefined;
  const crmPartnerId = searchParams.get('crm_partner_id') || undefined;
  const crmPartnerName = searchParams.get('crm_partner_name') || undefined;
  const crmValueUsd = searchParams.get('crm_value_usd') ? Number(searchParams.get('crm_value_usd')) : undefined;
  const crmDescription = searchParams.get('crm_description') || undefined;

  const crmPrefill = crmOpportunityId ? {
    name: crmOpportunityTitle || '',
    partnerId: crmPartnerId,
    clientName: crmPartnerName,
    clientType: 'customer' as const,
    description: crmDescription,
    budgetTotal: crmValueUsd,
    crmOpportunityId,
  } : undefined;

  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  
  const [totalBudget, setTotalBudget] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<ProjectBudget['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString());
  const [budgetNotes, setBudgetNotes] = useState('');
  const [categoryValues, setCategoryValues] = useState<Record<string, string>>({});

  const templateConfig = useMemo(() => {
    if (!templateType) return null;
    return getProjectTypeConfig(templateType);
  }, [templateType]);

  const oppName = searchParams.get('name');

  // Task #13: Template-based initial data (team roles, duration, description)
  const templateInitialData: Partial<Project> | undefined = useMemo(() => {
    if (!templateType || !templateConfig) return undefined;
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + templateConfig.templateDefaults.durationDays);
    const teamComposition = templateConfig.typicalTeamRoles.flatMap(r =>
      Array.from({ length: r.count }, (_, i) => ({
        userId: `template-${r.role}-${i}`,
        name: `[${r.role.replace(/([A-Z])/g, ' $1').trim()}]`,
        role: r.role as import('@/types/project').ProjectRole,
        joinedAt: today.toISOString(),
      }))
    );
    return {
      projectType: templateType,
      name: oppName ?? undefined,
      description: templateConfig.templateDefaults.description,
      startDate: today.toISOString(),
      endDate: end.toISOString(),
      team: { teamComposition },
    };
  }, [templateType, templateConfig, oppName]);

  // Merge: CRM prefill wins over template for shared fields (name, description, partner)
  const mergedInitialData: Partial<Project> | undefined = useMemo(() => {
    if (!crmPrefill && !templateInitialData) return undefined;
    const base: Partial<Project> = templateInitialData ? { ...templateInitialData } : {};
    if (crmPrefill) {
      if (crmPrefill.name) base.name = crmPrefill.name;
      if (crmPrefill.partnerId) base.partnerId = crmPrefill.partnerId;
      if (crmPrefill.clientName) base.clientName = crmPrefill.clientName;
      if (crmPrefill.clientType) base.clientType = crmPrefill.clientType;
      if (crmPrefill.description) base.description = crmPrefill.description;
      if (crmPrefill.budgetTotal) {
        base.budget = { total: crmPrefill.budgetTotal, currency: 'USD', allocated: 0, remaining: crmPrefill.budgetTotal };
      }
    }
    return base;
  }, [crmPrefill, templateInitialData]);

  const typeConfig = useMemo(() => {
    if (!createdProject) return null;
    return getProjectTypeConfig(createdProject.projectType);
  }, [createdProject?.projectType]);

  const handleProjectSubmit = async (project: Project) => {
    const projectWithCrm: Project = {
      ...project,
      ...(crmOpportunityId ? { crmOpportunityId } : {}),
    };
    const newProject = await addProject(projectWithCrm);
    if (newProject) {
      setCreatedProject(newProject);
      setCategoryValues({});
      setShowBudgetDialog(true);
    }
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) return;
    setShowBudgetDialog(open);
  };

  const handleCreateBudget = async () => {
    if (!createdProject || !totalBudget || parseFloat(totalBudget) <= 0) return;

    setBudgetLoading(true);
    try {
      const totalBudgetCents = Math.round(parseFloat(totalBudget) * 100);
      
      const categoryAllocations: Record<string, number> = {};
      Object.entries(categoryValues).forEach(([key, val]) => {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
          categoryAllocations[key] = Math.round(parsed * 100);
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

      await createProjectBudget({
        projectId: createdProject.id,
        totalBudgetCents,
        budgetPeriod,
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
        categoryAllocations,
        fiscalYear: parseInt(fiscalYear),
        budgetNotes,
      });

      setShowBudgetDialog(false);
      navigate(`/projects/${createdProject.id}`);
    } finally {
      setBudgetLoading(false);
    }
  };

  const categoryTotal = Object.values(categoryValues).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  const currency = createdProject?.budget?.currency ?? 'SDG';

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

        {/* Task #13: Template banner */}
        {templateConfig && (
          <div className="px-4 py-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">Template:</span>
              <span className="font-semibold">{templateConfig.label}</span>
              <span className="text-blue-600 dark:text-blue-400">— Pre-filled with default stages and {templateConfig.templateDefaults.durationDays}-day timeline.</span>
            </div>
            {templateConfig.typicalTeamRoles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Suggested team:</span>
                {templateConfig.typicalTeamRoles.map(r => (
                  <span key={r.role} className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                    {r.count}× {r.role.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Task #14: CRM banner */}
        {crmPrefill && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-4 py-3">
            <Handshake className="h-5 w-5 text-green-700 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-900 dark:text-green-300">Converting CRM Opportunity</p>
              <p className="text-xs text-green-700 dark:text-green-400">
                Pre-filled from: <span className="font-medium">{crmOpportunityTitle}</span>
                {crmPartnerName && <> · Partner: <span className="font-medium">{crmPartnerName}</span></>}
                {crmValueUsd && <> · Value: <span className="font-medium">${crmValueUsd.toLocaleString()}</span></>}
              </p>
            </div>
          </div>
        )}

        <ProjectForm onSubmit={handleProjectSubmit} initialData={mergedInitialData as any} />
      </div>

      <Dialog open={showBudgetDialog} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" hideCloseButton>
          <DialogHeader>
            <DialogTitle>Create Budget for {createdProject?.name}</DialogTitle>
            <DialogDescription>
              {typeConfig
                ? `Budget template for ${typeConfig.label}. Fill in the typical cost categories for this project type.`
                : 'A budget is required for all projects. Please set up the budget to continue.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="total-budget">Total Budget ({currency})</Label>
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
              <h4 className="font-medium mb-1">Category Allocations (Optional)</h4>
              {typeConfig && (
                <p className="text-xs text-muted-foreground mb-3">
                  Suggested categories for <strong>{typeConfig.label}</strong> projects
                </p>
              )}
              <div className="grid gap-3">
                {(typeConfig?.budgetCategories ?? [
                  { key: 'transportation_and_visit_fees', label: 'Transportation and Visit Fees', placeholder: '0.00' },
                  { key: 'permit_fee', label: 'Permit Fee', placeholder: '0.00' },
                  { key: 'internet_and_communication_fees', label: 'Internet & Communication Fees', placeholder: '0.00' },
                ]).map((cat) => (
                  <div key={cat.key} className="grid gap-2">
                    <Label htmlFor={`cat-${cat.key}`}>{cat.label} ({currency})</Label>
                    <Input
                      id={`cat-${cat.key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={categoryValues[cat.key] ?? ''}
                      onChange={(e) => setCategoryValues(prev => ({ ...prev, [cat.key]: e.target.value }))}
                      placeholder={cat.placeholder ?? '0.00'}
                      data-testid={`input-budget-cat-${cat.key}`}
                    />
                  </div>
                ))}
              </div>

              {categoryTotal > 0 && (
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Allocated:</span>
                    <span className="text-sm font-bold">
                      {currency} {categoryTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {totalBudget && categoryTotal > parseFloat(totalBudget) && (
                    <p className="text-sm text-destructive mt-1">
                      Category total exceeds budget by {currency} {(categoryTotal - parseFloat(totalBudget)).toFixed(2)}
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
