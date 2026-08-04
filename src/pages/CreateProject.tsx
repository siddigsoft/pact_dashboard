
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Handshake } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ProjectForm, { BudgetFormData } from '@/components/project/ProjectForm';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { Project, ProjectType } from '@/types/project';
import { getProjectTypeConfig } from '@/config/projectTypeConfig';
import { useToast } from '@/hooks/toast';

const CreateProject = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const templateType = searchParams.get('template') as ProjectType | null;
  const { addProject } = useProjectContext();
  const { createProjectBudget } = useBudget();

  // CRM opportunity prefill
  const crmOpportunityId    = searchParams.get('crm_opportunity_id')    || undefined;
  const crmOpportunityTitle = searchParams.get('crm_opportunity_title') || undefined;
  const crmPartnerId        = searchParams.get('crm_partner_id')        || undefined;
  const crmPartnerName      = searchParams.get('crm_partner_name')      || undefined;
  const crmValueUsd         = searchParams.get('crm_value_usd') ? Number(searchParams.get('crm_value_usd')) : undefined;
  const crmDescription      = searchParams.get('crm_description')       || undefined;

  const crmPrefill = crmOpportunityId ? {
    name: crmOpportunityTitle || '',
    partnerId: crmPartnerId,
    clientName: crmPartnerName,
    clientType: 'customer' as const,
    description: crmDescription,
    budgetTotal: crmValueUsd,
    crmOpportunityId,
  } : undefined;

  const templateConfig = useMemo(() => {
    if (!templateType) return null;
    return getProjectTypeConfig(templateType);
  }, [templateType]);

  const oppName = searchParams.get('name');

  // Template-based initial data
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

  // Merge: CRM prefill wins over template for shared fields
  const mergedInitialData: Partial<Project> | undefined = useMemo(() => {
    if (!crmPrefill && !templateInitialData) return undefined;
    const base: Partial<Project> = templateInitialData ? { ...templateInitialData } : {};
    if (crmPrefill) {
      if (crmPrefill.name)        base.name        = crmPrefill.name;
      if (crmPrefill.partnerId)   base.partnerId   = crmPrefill.partnerId;
      if (crmPrefill.clientName)  base.clientName  = crmPrefill.clientName;
      if (crmPrefill.clientType)  base.clientType  = crmPrefill.clientType;
      if (crmPrefill.description) base.description = crmPrefill.description;
      if (crmPrefill.budgetTotal) {
        base.budget = { total: crmPrefill.budgetTotal, currency: 'USD', allocated: 0, remaining: crmPrefill.budgetTotal };
      }
    }
    return base;
  }, [crmPrefill, templateInitialData]);

  // ── Unified submit — creates project + budget in one shot ──────────────
  const handleProjectSubmit = async (project: Project, budgetConfig?: BudgetFormData) => {
    const projectWithCrm: Project = {
      ...project,
      ...(crmOpportunityId ? { crmOpportunityId } : {}),
    };

    const newProject = await addProject(projectWithCrm);
    if (!newProject) return;

    if (budgetConfig && (newProject.budget?.total ?? 0) > 0) {
      try {
        const totalBudgetCents = Math.round((newProject.budget!.total) * 100);
        const fiscalYearNum    = parseInt(budgetConfig.fiscalYear) || new Date().getFullYear();

        const categoryAllocations: Record<string, number> = {};
        Object.entries(budgetConfig.categoryAllocations).forEach(([key, val]) => {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed > 0) {
            categoryAllocations[key] = Math.round(parsed * 100);
          }
        });

        let periodStart: string | undefined;
        let periodEnd:   string | undefined;
        if (budgetConfig.budgetPeriod === 'annual') {
          periodStart = `${fiscalYearNum}-01-01`;
          periodEnd   = `${fiscalYearNum}-12-31`;
        } else if (budgetConfig.budgetPeriod === 'project_lifetime') {
          periodStart = newProject.startDate;
          periodEnd   = newProject.endDate;
        } else if (budgetConfig.budgetPeriod === 'monthly') {
          const now   = new Date();
          periodStart = now.toISOString().split('T')[0];
          const next  = new Date(now);
          next.setMonth(next.getMonth() + 1);
          periodEnd   = next.toISOString().split('T')[0];
        }

        await createProjectBudget({
          projectId:       newProject.id,
          totalBudgetCents,
          budgetPeriod:    budgetConfig.budgetPeriod,
          periodStartDate: periodStart,
          periodEndDate:   periodEnd,
          categoryAllocations,
          fiscalYear:      fiscalYearNum,
          budgetNotes:     budgetConfig.budgetNotes,
        });
      } catch {
        toast({
          title: 'Project created — budget setup incomplete',
          description: 'The project was saved but the budget could not be configured. Open the project and use the Budget tab to set it up.',
          variant: 'destructive',
        });
      }
    }

    navigate(`/projects/${newProject.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/projects')}
          className="hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <p className="text-muted-foreground">Set up a new project in the planning system</p>
        </div>
      </div>

      {/* Template banner */}
      {templateConfig && (
        <div className="px-4 py-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">Template:</span>
            <span className="font-semibold">{templateConfig.label}</span>
            <span className="text-blue-600 dark:text-blue-400">
              — Pre-filled with default stages and {templateConfig.templateDefaults.durationDays}-day timeline.
            </span>
          </div>
          {templateConfig.typicalTeamRoles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-blue-600 dark:text-blue-400 font-medium">Suggested team:</span>
              {templateConfig.typicalTeamRoles.map(r => (
                <span
                  key={r.role}
                  className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                >
                  {r.count}× {r.role.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CRM conversion banner */}
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
  );
};

export default CreateProject;
