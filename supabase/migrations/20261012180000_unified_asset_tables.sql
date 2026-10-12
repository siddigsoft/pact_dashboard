-- Unified Asset Register tables (originally drafted in 20260803_acct_extensions
-- and 20260803d_asset_depreciation_rpc, never applied). Access is driven by
-- fixed_assets:* permissions instead of role names.

create table if not exists public.unified_assets (
  id                       uuid          primary key default gen_random_uuid(),
  asset_code               text          not null unique,
  name                     text          not null,
  asset_type               text          not null check (asset_type in ('hr','field_equipment','fixed_asset')),
  category                 text          not null,
  serial_number            text,
  model                    text,
  purchase_date            date,
  purchase_value           numeric(20,4),
  currency                 text          not null default 'SDG',
  useful_life_years        int,
  depreciation_method      text          check (depreciation_method in ('straight_line','declining_balance','units_of_production','sum_of_years')),
  depreciation_rate        numeric(8,6),
  accumulated_depreciation numeric(20,4) not null default 0,
  status                   text          not null default 'available'
                           check (status in ('available','assigned','maintenance','retired','lost','disposed')),
  condition                text          check (condition in ('excellent','good','fair','poor','beyond_repair')),
  hub                      text,
  location                 text,
  custodian_name           text,
  assigned_to_id           uuid          references public.profiles(id) on delete set null,
  warranty_expiry          date,
  insurance_policy         text,
  notes                    text,
  dep_expense_account_id   uuid          references public.acct_accounts(id) on delete set null,
  accum_dep_account_id     uuid          references public.acct_accounts(id) on delete set null,
  created_at               timestamptz   not null default now(),
  created_by               uuid          references public.profiles(id) on delete set null
);

create index if not exists idx_unified_assets_type     on public.unified_assets(asset_type);
create index if not exists idx_unified_assets_hub      on public.unified_assets(hub);
create index if not exists idx_unified_assets_status   on public.unified_assets(status);
create index if not exists idx_unified_assets_assignee on public.unified_assets(assigned_to_id);

create table if not exists public.asset_assignment_logs (
  id                      uuid        primary key default gen_random_uuid(),
  asset_id                uuid        not null references public.unified_assets(id) on delete cascade,
  assigned_to_id          uuid        references public.profiles(id) on delete set null,
  assigned_to_name        text,
  assigned_by_id          uuid        references public.profiles(id) on delete set null,
  assigned_date           date        not null,
  returned_date           date,
  condition_on_assignment text,
  condition_on_return     text,
  notes                   text,
  created_at              timestamptz not null default now()
);

create index if not exists idx_asset_assignment_logs_asset on public.asset_assignment_logs(asset_id);

create table if not exists public.asset_disposals (
  id               uuid          primary key default gen_random_uuid(),
  asset_id         uuid          not null references public.unified_assets(id) on delete restrict,
  disposal_type    text          not null check (disposal_type in ('sale','write_off','donation','loss','stolen','destroyed')),
  disposal_date    date          not null,
  proceeds         numeric(20,4) not null default 0,
  currency         text          not null default 'SDG',
  reason           text          not null,
  approved_by      uuid          references public.profiles(id) on delete set null,
  journal_entry_id uuid          references public.acct_journal_entries(id) on delete set null,
  created_at       timestamptz   not null default now(),
  created_by       uuid          references public.profiles(id) on delete set null
);

create index if not exists idx_asset_disposals_asset on public.asset_disposals(asset_id);

create table if not exists public.asset_depreciation_runs (
  id                 uuid          primary key default gen_random_uuid(),
  fiscal_period_id   uuid          references public.acct_fiscal_periods(id) on delete set null,
  period_label       text          not null,
  periods_per_year   int           not null default 12,
  run_date           date          not null default current_date,
  asset_count        int           not null default 0,
  total_depreciation numeric(20,4) not null default 0,
  skipped_count      int           not null default 0,
  error_count        int           not null default 0,
  status             text          not null default 'completed' check (status in ('completed','partial','error')),
  notes              text,
  posted_by          uuid          references public.profiles(id) on delete set null,
  created_at         timestamptz   not null default now()
);

create index if not exists idx_adr_period on public.asset_depreciation_runs(fiscal_period_id);

alter table public.unified_assets          enable row level security;
alter table public.asset_assignment_logs   enable row level security;
alter table public.asset_disposals         enable row level security;
alter table public.asset_depreciation_runs enable row level security;

revoke all on public.unified_assets, public.asset_assignment_logs,
              public.asset_disposals, public.asset_depreciation_runs from anon;

-- unified_assets: register holders see everything, custodians see what they hold.
create policy unified_assets_read on public.unified_assets
  for select to authenticated
  using (
    assigned_to_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('fixed_assets', 'read'))
  );

create policy unified_assets_insert on public.unified_assets
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('fixed_assets', 'create')));

-- Assigning and disposing both change the asset row (custodian / status).
create policy unified_assets_update on public.unified_assets
  for update to authenticated
  using (
    (select public.current_user_has_resource_permission('fixed_assets', 'update'))
    or (select public.current_user_has_resource_permission('fixed_assets', 'assign'))
    or (select public.current_user_has_resource_permission('fixed_assets', 'delete'))
  )
  with check (
    (select public.current_user_has_resource_permission('fixed_assets', 'update'))
    or (select public.current_user_has_resource_permission('fixed_assets', 'assign'))
    or (select public.current_user_has_resource_permission('fixed_assets', 'delete'))
  );

create policy unified_assets_delete on public.unified_assets
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('fixed_assets', 'delete')));

-- Assignment history is append-only.
create policy asset_assignment_logs_read on public.asset_assignment_logs
  for select to authenticated
  using (
    assigned_to_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('fixed_assets', 'read'))
  );

create policy asset_assignment_logs_insert on public.asset_assignment_logs
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('fixed_assets', 'assign')));

-- Disposal records are append-only.
create policy asset_disposals_read on public.asset_disposals
  for select to authenticated
  using ((select public.current_user_has_resource_permission('fixed_assets', 'read')));

create policy asset_disposals_insert on public.asset_disposals
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('fixed_assets', 'delete')));

-- Depreciation runs are written only by the posting function.
create policy asset_depreciation_runs_read on public.asset_depreciation_runs
  for select to authenticated
  using ((select public.current_user_has_resource_permission('fixed_assets', 'read')));
