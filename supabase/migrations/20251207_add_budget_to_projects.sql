-- Add budget jsonb column to projects table to store complete budget data
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS budget jsonb NULL;

-- Create index for efficient budget queries
CREATE INDEX IF NOT EXISTS idx_projects_budget 
ON public.projects USING GIN (budget);

-- Update projects to include complete budget data from project_budgets table
UPDATE public.projects p
SET budget = (
  SELECT jsonb_build_object(
    'id', pb.id,
    'projectId', pb.project_id,
    'totalBudgetCents', pb.total_budget_cents,
    'allocatedBudgetCents', pb.allocated_budget_cents,
    'spentBudgetCents', pb.spent_budget_cents,
    'remainingBudgetCents', pb.remaining_budget_cents,
    'budgetPeriod', pb.budget_period,
    'periodStartDate', pb.period_start_date,
    'periodEndDate', pb.period_end_date,
    'categoryAllocations', pb.category_allocations,
    'status', pb.status,
    'approvedBy', pb.approved_by,
    'approvedAt', pb.approved_at,
    'fiscalYear', pb.fiscal_year,
    'budgetNotes', pb.budget_notes,
    'createdBy', pb.created_by,
    'updatedBy', pb.updated_by,
    'createdAt', pb.created_at,
    'updatedAt', pb.updated_at
  )
  FROM public.project_budgets pb
  WHERE pb.project_id = p.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM public.project_budgets pb WHERE pb.project_id = p.id
);
