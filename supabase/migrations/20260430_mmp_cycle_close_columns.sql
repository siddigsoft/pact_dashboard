-- MMP Cycle Close: add all missing columns to mmp_files
-- Safe to run even if some columns already exist (IF NOT EXISTS guards).
-- Run this in your Supabase SQL Editor.

-- Core cycle tracking (may have been added by 20260408_task16_close_gate_rpcs.sql)
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_status            text;
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closed_at         timestamptz;
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closed_by         uuid REFERENCES auth.users(id);
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_approved_by       uuid REFERENCES auth.users(id);
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_close_records     jsonb;

-- Columns required by the closing workflow (new — not in previous migration)
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closing_started_at  timestamptz;
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_closing_started_by  uuid REFERENCES auth.users(id);
ALTER TABLE public.mmp_files ADD COLUMN IF NOT EXISTS cycle_close_deadline       timestamptz;

-- Optional: index on cycle_status for the Active Cycles tab query
CREATE INDEX IF NOT EXISTS idx_mmp_files_cycle_status ON public.mmp_files(cycle_status);
