-- Ensure budget_transactions table exists with correct schema
ALTER TABLE public.budget_transactions
ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS project_budget_id uuid,
ADD COLUMN IF NOT EXISTS mmp_budget_id uuid,
ADD COLUMN IF NOT EXISTS site_visit_id uuid,
ADD COLUMN IF NOT EXISTS wallet_transaction_id uuid,
ADD COLUMN IF NOT EXISTS transaction_type character varying NOT NULL,
ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL,
ADD COLUMN IF NOT EXISTS currency character varying DEFAULT 'SDG'::character varying,
ADD COLUMN IF NOT EXISTS category character varying,
ADD COLUMN IF NOT EXISTS balance_before_cents bigint,
ADD COLUMN IF NOT EXISTS balance_after_cents bigint,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS metadata jsonb,
ADD COLUMN IF NOT EXISTS reference_number character varying,
ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- Ensure budget_alerts table exists with correct schema
ALTER TABLE public.budget_alerts
ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS project_budget_id uuid,
ADD COLUMN IF NOT EXISTS mmp_budget_id uuid,
ADD COLUMN IF NOT EXISTS alert_type character varying NOT NULL,
ADD COLUMN IF NOT EXISTS severity character varying DEFAULT 'warning'::character varying,
ADD COLUMN IF NOT EXISTS threshold_percentage integer,
ADD COLUMN IF NOT EXISTS title character varying NOT NULL,
ADD COLUMN IF NOT EXISTS message text,
ADD COLUMN IF NOT EXISTS status character varying DEFAULT 'active'::character varying,
ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS metadata jsonb,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_budget_transactions_project_budget_id ON public.budget_transactions(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_created_at ON public.budget_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_project_budget_id ON public.budget_alerts(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_status ON public.budget_alerts(status);
