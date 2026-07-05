-- Fixes: running "Carry Forward" more than once (or after an admin already
-- manually set next year's annual_days) kept adding the carry-forward amount
-- on top of whatever was already there, silently inflating next year's
-- annual leave balance every time the button was pressed again.
--
-- Adds a `carried_forward_days` marker column so the app can detect that a
-- carry-forward has already been applied for a given user/year and skip it
-- instead of adding a second time.

alter table public.leave_entitlements
  add column if not exists carried_forward_days integer not null default 0;

comment on column public.leave_entitlements.carried_forward_days is
  'Days added to annual_days by the HR "Carry Forward" tool for this year. Used to make re-running carry-forward idempotent (skip once already applied).';
