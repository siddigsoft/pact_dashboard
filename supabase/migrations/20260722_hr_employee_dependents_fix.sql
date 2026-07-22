-- ================================================================
-- Fix hr_employee_dependents table
-- The component (EmployeeDependentsTab) uses profile_id, not user_id.
-- This migration:
--   1. Creates the table with profile_id if it does not exist yet.
--   2. If the table already exists with a user_id column, renames it
--      to profile_id so existing data is preserved.
-- Safe to run multiple times (idempotent).
-- ================================================================

DO $$
BEGIN

  -- ── Case A: table does not exist at all → create it correctly ──────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hr_employee_dependents'
  ) THEN

    CREATE TABLE public.hr_employee_dependents (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      full_name        TEXT        NOT NULL,
      relationship     TEXT        NOT NULL DEFAULT 'child'
                                   CHECK (relationship IN ('spouse','child','parent','sibling','other')),
      date_of_birth    DATE,
      gender           TEXT        CHECK (gender IS NULL OR gender IN ('male','female','other')),
      national_id_no   TEXT,
      is_beneficiary   BOOLEAN     NOT NULL DEFAULT FALSE,
      health_insurance BOOLEAN     NOT NULL DEFAULT FALSE,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_hr_employee_dependents_profile_id
      ON public.hr_employee_dependents (profile_id);

    ALTER TABLE public.hr_employee_dependents ENABLE ROW LEVEL SECURITY;

  END IF;

  -- ── Case B: table exists but has user_id instead of profile_id ─────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'hr_employee_dependents'
      AND column_name  = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'hr_employee_dependents'
      AND column_name  = 'profile_id'
  ) THEN
    ALTER TABLE public.hr_employee_dependents RENAME COLUMN user_id TO profile_id;
  END IF;

END $$;

-- ── RLS policies (DROP IF EXISTS + recreate so this is idempotent) ─────────

DROP POLICY IF EXISTS hr_dependents_select  ON public.hr_employee_dependents;
DROP POLICY IF EXISTS hr_dependents_insert  ON public.hr_employee_dependents;
DROP POLICY IF EXISTS hr_dependents_update  ON public.hr_employee_dependents;
DROP POLICY IF EXISTS hr_dependents_delete  ON public.hr_employee_dependents;

-- Admins / HR can see all; employees can view their own
CREATE POLICY hr_dependents_select ON public.hr_employee_dependents
  FOR SELECT USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY hr_dependents_insert ON public.hr_employee_dependents
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY hr_dependents_update ON public.hr_employee_dependents
  FOR UPDATE USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY hr_dependents_delete ON public.hr_employee_dependents
  FOR DELETE USING (
    auth.uid() = profile_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_employee_dependents_updated_at
  ON public.hr_employee_dependents;

CREATE TRIGGER trg_hr_employee_dependents_updated_at
  BEFORE UPDATE ON public.hr_employee_dependents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Refresh PostgREST schema cache so the table is immediately queryable
NOTIFY pgrst, 'reload schema';
