-- Add profile_folder_path column to hr_employee_personal
-- This stores the Supabase Storage folder path for the employee's workspace dossier
-- Format: profiles/{EmployeeID}_{FirstName}_{LastName}
-- The folder contains PROFILE_SUMMARY.pdf (auto-generated, always overwritten on profile update)

ALTER TABLE hr_employee_personal
  ADD COLUMN IF NOT EXISTS profile_folder_path text;
