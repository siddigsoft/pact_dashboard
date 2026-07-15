-- Add professional_summary to hr_employee_personal
-- Run once in Supabase SQL Editor
ALTER TABLE hr_employee_personal ADD COLUMN IF NOT EXISTS professional_summary text;
