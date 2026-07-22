-- ── Add Next of Kin fields to hr_employee_dependents ─────────────────────────
-- Avoids a separate table; a dependent can simply be flagged as Next of Kin.
-- Extra contact fields (phone, email) are only relevant for the NOK role.

alter table public.hr_employee_dependents
  add column if not exists is_next_of_kin boolean not null default false,
  add column if not exists nok_phone      text,
  add column if not exists nok_email      text;

-- Only one Next of Kin per employee makes sense — enforce via partial unique index
create unique index if not exists hr_employee_dependents_nok_unique
  on public.hr_employee_dependents (profile_id)
  where is_next_of_kin = true;
