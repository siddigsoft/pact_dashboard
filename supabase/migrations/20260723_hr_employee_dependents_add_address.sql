-- Add address field to hr_employee_dependents
alter table public.hr_employee_dependents
  add column if not exists address text;
