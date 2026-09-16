-- Make every individual page/action override explainable and time-bound when
-- needed.  `granted_by` remains for backwards compatibility; `approved_by`
-- and `approved_at` are the shared contract used by both override tables.

alter table public.page_access_overrides
  add column if not exists reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

alter table public.user_permission_overrides
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

-- Existing rows retain their original attribution instead of being rewritten
-- as if the current administrator approved them.
update public.page_access_overrides
set approved_by = coalesce(approved_by, granted_by),
    approved_at = coalesce(approved_at, created_at)
where approved_by is null or approved_at is null;

update public.user_permission_overrides
set approved_by = coalesce(approved_by, granted_by),
    approved_at = coalesce(approved_at, created_at)
where approved_by is null or approved_at is null;

create index if not exists page_access_overrides_active_expiry_idx
  on public.page_access_overrides (expires_at)
  where expires_at is not null;

create index if not exists user_permission_overrides_active_expiry_idx
  on public.user_permission_overrides (expires_at)
  where expires_at is not null;

comment on column public.page_access_overrides.reason is
  'Why this individual page decision differs from the role default.';
comment on column public.page_access_overrides.expires_at is
  'Optional expiry. Expired overrides are ignored by access evaluators.';
comment on column public.page_access_overrides.approved_by is
  'Administrator who approved the current override decision.';
comment on column public.user_permission_overrides.approved_by is
  'Administrator who approved the current override decision.';
