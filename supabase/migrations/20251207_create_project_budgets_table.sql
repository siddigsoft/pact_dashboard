-- Ensure project_budgets table exists with correct schema
-- This table should already exist, but we ensure all columns are present

-- Add missing columns if they don't exist
ALTER TABLE public.project_budgets
ADD COLUMN IF NOT EXISTS total_budget_cents bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS allocated_budget_cents bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS spent_budget_cents bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_budget_cents bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget_period character varying NOT NULL,
ADD COLUMN IF NOT EXISTS period_start_date date,
ADD COLUMN IF NOT EXISTS period_end_date date,
ADD COLUMN IF NOT EXISTS category_allocations jsonb DEFAULT '{"meals": 0, "other": 0, "equipment": 0, "site_visits": 0, "accommodation": 0, "transportation": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS status character varying DEFAULT 'draft'::character varying,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS fiscal_year integer,
ADD COLUMN IF NOT EXISTS budget_notes text,
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS updated_by uuid,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id ON public.project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_status ON public.project_budgets(status);
CREATE INDEX IF NOT EXISTS idx_project_budgets_created_at ON public.project_budgets(created_at DESC);
