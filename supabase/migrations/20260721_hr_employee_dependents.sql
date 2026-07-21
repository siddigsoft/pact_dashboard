-- ================================================================
-- Create hr_employee_dependents table
-- Stores family members, beneficiaries, and insurance dependents
-- for each employee profile.
-- Run in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS public.hr_employee_dependents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  relationship     TEXT NOT NULL DEFAULT 'child',
  date_of_birth    DATE,
  gender           TEXT,
  national_id_no   TEXT,
  is_beneficiary   BOOLEAN NOT NULL DEFAULT FALSE,
  health_insurance BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-employee lookups
CREATE INDEX IF NOT EXISTS idx_hr_employee_dependents_user_id
  ON public.hr_employee_dependents (user_id);

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

-- RLS
ALTER TABLE public.hr_employee_dependents ENABLE ROW LEVEL SECURITY;

-- Admins / HR can see all; employees can see their own
CREATE POLICY "hr_dependents_select" ON public.hr_employee_dependents
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY "hr_dependents_insert" ON public.hr_employee_dependents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY "hr_dependents_update" ON public.hr_employee_dependents
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

CREATE POLICY "hr_dependents_delete" ON public.hr_employee_dependents
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin')
    )
  );

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
