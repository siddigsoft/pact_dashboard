-- ─────────────────────────────────────────────────────────────────────────────
-- Unified Access Management: column_visibility_config + data_scope_config
-- Run in Supabase Studio SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. column_visibility_config
-- Controls which columns in tables/reports are hidden per role (default) or per user (override)
CREATE TABLE IF NOT EXISTS public.column_visibility_config (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT,                       -- camelCase role code e.g. 'coordinator'
  page_slug     TEXT        NOT NULL,       -- e.g. 'payroll-admin', 'site-visits'
  column_key    TEXT        NOT NULL,       -- e.g. 'net_pay', 'bank_account'
  is_hidden     BOOLEAN     NOT NULL DEFAULT true,
  set_by        UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cvc_user_or_role CHECK (
    (user_id IS NOT NULL AND role IS NULL) OR
    (user_id IS NULL   AND role IS NOT NULL)
  )
);

-- Unique per (user, page, column) and per (role, page, column) using partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_cvc_user
  ON public.column_visibility_config (user_id, page_slug, column_key)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cvc_role
  ON public.column_visibility_config (role, page_slug, column_key)
  WHERE role IS NOT NULL;

ALTER TABLE public.column_visibility_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cvc_superadmin_all" ON public.column_visibility_config
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin'));

CREATE POLICY "cvc_read_own" ON public.column_visibility_config
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );

-- ─────────────────────────────────────────────────────────────────────────────

-- 2. data_scope_config
-- Controls which data records (hubs, projects, states) a role or user can access
CREATE TABLE IF NOT EXISTS public.data_scope_config (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT,
  scope_type    TEXT        NOT NULL CHECK (scope_type IN ('hub', 'project', 'state', 'cost_center')),
  scope_value   TEXT        NOT NULL,   -- hub_id, project_id, state name, etc.
  scope_label   TEXT,                   -- human-readable label for display
  set_by        UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dsc_user_or_role CHECK (
    (user_id IS NOT NULL AND role IS NULL) OR
    (user_id IS NULL   AND role IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dsc_user
  ON public.data_scope_config (user_id, scope_type, scope_value)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dsc_role
  ON public.data_scope_config (role, scope_type, scope_value)
  WHERE role IS NOT NULL;

ALTER TABLE public.data_scope_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsc_superadmin_all" ON public.data_scope_config
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superAdmin'));

CREATE POLICY "dsc_read_own" ON public.data_scope_config
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );
