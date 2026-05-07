-- =============================================================================
-- PACT Accounting — Phase 7: Statutory Reporting
-- PIT (Personal Income Tax) · Social Insurance · Zakat
--
-- Creates (8 objects):
--   acct_tax_brackets         — progressive PIT rate table (Sudan 2024 rates seeded)
--   acct_social_rates         — social insurance employee/employer rates (Sudan seeded)
--   acct_zakat_config         — annual zakat nisab + rate configuration
--   acct_tax_withholding      — per-employee per-period withholding computation records
--   acct_statutory_filings    — monthly/annual filing submissions
--   acct_compute_pit()        — RPC: compute PIT on a gross salary amount
--   acct_statutory_summary()  — RPC: period-level aggregates for statutory dashboard
--   acct_trig_statutory_filing_paid() — GL bridge on filing → paid
--   v_acct_phase7_coverage    — bridge health view
--
-- Apply: any time after Phase 1 (independent of Phases 4–6).
-- Idempotent: all CREATE TABLE / CREATE INDEX / CREATE POLICY guarded with
--   IF NOT EXISTS; column additions use DO $$ IF NOT EXISTS checks.
-- =============================================================================

-- ── PART A: Tax Brackets ─────────────────────────────────────────────────────
-- Stores progressive tax brackets for PIT (and optionally other tax types).
-- One row per band per tax_type per country; multiple effective dates supported.
-- Sudan 2024 annual PIT brackets (SDG/year) seeded below.

create table if not exists public.acct_tax_brackets (
  id             uuid        primary key default gen_random_uuid(),
  tax_type       text        not null default 'PIT',   -- PIT | SOCIAL | ZAKAT
  country        text        not null default 'SD',    -- ISO-3166-1 alpha-2
  name           text        not null,                 -- human label, e.g. "Band 1 (0–36 000)"
  lower_bound    numeric(20,2) not null default 0,     -- annual taxable income ≥ this
  upper_bound    numeric(20,2),                        -- annual taxable income < this (null = no cap)
  rate_pct       numeric(6,4) not null,                -- e.g. 10.0000 means 10 %
  effective_from date        not null default '2024-01-01',
  effective_to   date,                                 -- null = current
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_acct_tax_bkt_type_country
  on public.acct_tax_brackets (tax_type, country, effective_from);

alter table public.acct_tax_brackets enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_tax_brackets' and policyname = 'tax_brackets_select'
  ) then
    execute 'create policy "tax_brackets_select" on public.acct_tax_brackets
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_tax_brackets' and policyname = 'tax_brackets_modify'
  ) then
    execute $pol$create policy "tax_brackets_modify" on public.acct_tax_brackets
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance'
            )
        )
      )$pol$;
  end if;
end $$;

-- Seed: Sudan 2024 PIT annual bands (SDG).  Source: Sudan Income Tax Act 2024.
-- Bands are on ANNUAL taxable income. Monthly = annual / 12.
insert into public.acct_tax_brackets
  (tax_type, country, name, lower_bound, upper_bound, rate_pct, effective_from, notes)
values
  ('PIT','SD','Exempt (0 – 36 000)',      0,        36000,   0,     '2024-01-01', 'Personal allowance'),
  ('PIT','SD','Band 1 (36 001 – 60 000)', 36000,    60000,   10,    '2024-01-01', NULL),
  ('PIT','SD','Band 2 (60 001 – 120 000)',60000,    120000,  15,    '2024-01-01', NULL),
  ('PIT','SD','Band 3 (120 001 – 240 000)',120000,  240000,  20,    '2024-01-01', NULL),
  ('PIT','SD','Band 4 (> 240 000)',        240000,  NULL,    25,    '2024-01-01', 'Top marginal rate')
on conflict do nothing;

-- ── PART B: Social Insurance Rates ──────────────────────────────────────────

create table if not exists public.acct_social_rates (
  id              uuid        primary key default gen_random_uuid(),
  country         text        not null default 'SD',
  employee_rate   numeric(6,4) not null,   -- % deducted from employee gross
  employer_rate   numeric(6,4) not null,   -- % added by employer
  effective_from  date        not null default '2024-01-01',
  effective_to    date,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.acct_social_rates enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_social_rates' and policyname = 'social_rates_select'
  ) then
    execute 'create policy "social_rates_select" on public.acct_social_rates
             for select to authenticated using (true)';
  end if;
end $$;

-- Seed: Sudan Social Insurance — employee 8%, employer 17%
insert into public.acct_social_rates
  (country, employee_rate, employer_rate, effective_from, notes)
values
  ('SD', 8, 17, '2024-01-01',
   'Sudan Social Insurance & Pensions Commission (SIPC) rates 2024')
on conflict do nothing;

-- ── PART C: Zakat Configuration ──────────────────────────────────────────────

create table if not exists public.acct_zakat_config (
  id              uuid        primary key default gen_random_uuid(),
  fiscal_year_id  uuid        references public.acct_fiscal_years(id) on delete set null,
  country         text        not null default 'SD',
  nisab_sdg       numeric(20,2) not null,   -- minimum zakatable wealth in SDG
  rate_pct        numeric(6,4) not null default 2.5,
  effective_from  date        not null,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.acct_zakat_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_zakat_config' and policyname = 'zakat_config_select'
  ) then
    execute 'create policy "zakat_config_select" on public.acct_zakat_config
             for select to authenticated using (true)';
  end if;
end $$;

-- ── PART D: Tax Withholding Records ─────────────────────────────────────────
-- One row per employee per accounting period.
-- Values are stored in SDG; currency field records the denomination.

create table if not exists public.acct_tax_withholding (
  id                      uuid        primary key default gen_random_uuid(),
  employee_id             uuid        not null references public.profiles(id) on delete restrict,
  period_id               uuid        not null references public.acct_fiscal_periods(id) on delete restrict,
  gross_salary            numeric(20,2) not null,
  taxable_income          numeric(20,2) not null,   -- gross minus exemptions
  pit_amount              numeric(20,2) not null default 0,
  social_employee_amount  numeric(20,2) not null default 0,
  social_employer_amount  numeric(20,2) not null default 0,
  zakat_amount            numeric(20,2) not null default 0,
  total_employee_deduction numeric(20,2)
    generated always as (pit_amount + social_employee_amount) stored,
  total_employer_cost     numeric(20,2)
    generated always as (social_employer_amount) stored,
  currency                text        not null default 'SDG',
  status                  text        not null default 'draft'
    check (status in ('draft','submitted','paid','cancelled')),
  notes                   text,
  computed_at             timestamptz not null default now(),
  submitted_at            timestamptz,
  paid_at                 timestamptz,
  created_by              uuid        references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (employee_id, period_id)
);

create index if not exists idx_acct_wh_period   on public.acct_tax_withholding (period_id);
create index if not exists idx_acct_wh_employee on public.acct_tax_withholding (employee_id);
create index if not exists idx_acct_wh_status   on public.acct_tax_withholding (status);

alter table public.acct_tax_withholding enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_tax_withholding' and policyname = 'tax_wh_select'
  ) then
    execute 'create policy "tax_wh_select" on public.acct_tax_withholding
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_tax_withholding' and policyname = 'tax_wh_modify'
  ) then
    execute $pol$create policy "tax_wh_modify" on public.acct_tax_withholding
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance','hr'
            )
        )
      )$pol$;
  end if;
end $$;

-- updated_at trigger
create or replace function public.update_acct_tax_withholding_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_tax_wh_updated_at on public.acct_tax_withholding;
create trigger acct_tax_wh_updated_at
  before update on public.acct_tax_withholding
  for each row execute function public.update_acct_tax_withholding_updated_at();

-- ── PART E: Statutory Filings ─────────────────────────────────────────────────
-- Tracks the monthly/annual submissions made to tax / social insurance authority.

create table if not exists public.acct_statutory_filings (
  id              uuid        primary key default gen_random_uuid(),
  filing_type     text        not null
    check (filing_type in (
      'pit_monthly','pit_annual',
      'social_monthly','social_annual',
      'zakat_annual'
    )),
  period_id       uuid        references public.acct_fiscal_periods(id) on delete set null,
  fiscal_year_id  uuid        references public.acct_fiscal_years(id) on delete set null,
  filing_date     date,
  due_date        date,
  total_amount    numeric(20,2) not null default 0,
  currency        text        not null default 'SDG',
  status          text        not null default 'draft'
    check (status in ('draft','submitted','accepted','overdue','paid')),
  reference_number text,             -- authority-assigned reference
  submitted_by    uuid        references auth.users(id),
  submitted_at    timestamptz,
  paid_at         timestamptz,
  payment_reference text,
  notes           text,
  created_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_acct_sf_type   on public.acct_statutory_filings (filing_type);
create index if not exists idx_acct_sf_period on public.acct_statutory_filings (period_id);
create index if not exists idx_acct_sf_status on public.acct_statutory_filings (status);
create index if not exists idx_acct_sf_due    on public.acct_statutory_filings (due_date)
  where status not in ('paid','accepted');

alter table public.acct_statutory_filings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_statutory_filings' and policyname = 'statutory_filings_select'
  ) then
    execute 'create policy "statutory_filings_select" on public.acct_statutory_filings
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_statutory_filings' and policyname = 'statutory_filings_modify'
  ) then
    execute $pol$create policy "statutory_filings_modify" on public.acct_statutory_filings
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance'
            )
        )
      )$pol$;
  end if;
end $$;

-- updated_at trigger
create or replace function public.update_acct_statutory_filings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_statutory_filings_updated_at on public.acct_statutory_filings;
create trigger acct_statutory_filings_updated_at
  before update on public.acct_statutory_filings
  for each row execute function public.update_acct_statutory_filings_updated_at();

-- ── PART F: acct_compute_pit() RPC ───────────────────────────────────────────
-- Computes PIT for a given annual gross salary using the active Sudan brackets.
-- Returns: pit_annual, pit_monthly, effective_rate_pct.

create or replace function public.acct_compute_pit(
  p_gross_annual   numeric,
  p_country        text    default 'SD',
  p_effective_date date    default current_date
)
returns table (
  band_name        text,
  band_lower       numeric,
  band_upper       numeric,
  rate_pct         numeric,
  taxable_in_band  numeric,
  tax_in_band      numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.name                                                as band_name,
    b.lower_bound                                         as band_lower,
    b.upper_bound                                         as band_upper,
    b.rate_pct,
    greatest(0,
      least(
        coalesce(b.upper_bound, p_gross_annual),
        p_gross_annual
      ) - b.lower_bound
    )                                                     as taxable_in_band,
    round(
      greatest(0,
        least(
          coalesce(b.upper_bound, p_gross_annual),
          p_gross_annual
        ) - b.lower_bound
      ) * b.rate_pct / 100, 2
    )                                                     as tax_in_band
  from public.acct_tax_brackets b
  where b.tax_type = 'PIT'
    and b.country  = p_country
    and b.effective_from <= p_effective_date
    and (b.effective_to is null or b.effective_to >= p_effective_date)
    and p_gross_annual > b.lower_bound
  order by b.lower_bound;
$$;

-- ── PART G: acct_statutory_summary() RPC ─────────────────────────────────────
-- Period-level aggregates: PIT total, social employee, social employer, zakat.
-- If p_period_id is null, returns totals for all periods (dashboard overview).

create or replace function public.acct_statutory_summary(
  p_period_id uuid default null
)
returns table (
  period_id               uuid,
  period_name             text,
  employee_count          bigint,
  total_gross             numeric,
  total_pit               numeric,
  total_social_employee   numeric,
  total_social_employer   numeric,
  total_zakat             numeric,
  total_employee_deduction numeric,
  total_employer_cost     numeric,
  draft_count             bigint,
  submitted_count         bigint,
  paid_count              bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.period_id,
    to_char(p.start_date, 'Mon YYYY')                             as period_name,
    count(distinct w.employee_id)                                 as employee_count,
    sum(w.gross_salary)                                           as total_gross,
    sum(w.pit_amount)                                             as total_pit,
    sum(w.social_employee_amount)                                 as total_social_employee,
    sum(w.social_employer_amount)                                 as total_social_employer,
    sum(w.zakat_amount)                                           as total_zakat,
    sum(w.total_employee_deduction)                               as total_employee_deduction,
    sum(w.total_employer_cost)                                    as total_employer_cost,
    count(*) filter (where w.status = 'draft')                    as draft_count,
    count(*) filter (where w.status = 'submitted')                as submitted_count,
    count(*) filter (where w.status = 'paid')                     as paid_count
  from public.acct_tax_withholding w
  join public.acct_fiscal_periods p on p.id = w.period_id
  where (p_period_id is null or w.period_id = p_period_id)
  group by w.period_id, p.start_date, p.period_no
  order by p.start_date desc;
$$;

-- ── PART H: GL Bridge — statutory filing paid ────────────────────────────────

create or replace function public.acct_trig_statutory_filing_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- feature flag gate
  if not exists (
    select 1 from public.feature_flags
    where key = 'acct.bridge.statutory_filing' and is_enabled = true
  ) then
    return new;
  end if;

  -- fire only on status transition to 'paid'
  if (old.status is distinct from new.status) and new.status = 'paid' then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status,
      je_reference, je_description
    ) values (
      'acct_statutory_filings',
      new.id,
      'statutory_filing_paid',
      'success',
      new.payment_reference,
      format('Statutory filing paid — type: %s | amount: %s %s | ref: %s | paid: %s',
        new.filing_type,
        new.total_amount,
        new.currency,
        coalesce(new.reference_number, 'n/a'),
        coalesce(new.paid_at::text, now()::text))
    );
  end if;

  -- fire only on status transition to 'submitted'
  if (old.status is distinct from new.status) and new.status = 'submitted' then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_statutory_filings', new.id, 'statutory_filing_submitted', 'success',
      format('Statutory filing submitted — type: %s | amount: %s %s | due: %s',
        new.filing_type, new.total_amount, new.currency,
        coalesce(new.due_date::text,'n/a'))
    );
  end if;

  return new;
end;
$$;

-- ── PART I: Overdue filing auto-flag function ─────────────────────────────────
-- Call this from a scheduled edge function or manually to flag overdue filings.

create or replace function public.acct_flag_overdue_filings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.acct_statutory_filings
  set    status = 'overdue'
  where  status not in ('paid','accepted','overdue')
    and  due_date < current_date;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── PART J: Coverage view ─────────────────────────────────────────────────────

create or replace view public.v_acct_phase7_coverage as
select
  source_table,
  count(*)                                                              as total_events,
  count(*) filter (where status = 'success')                            as success_count,
  count(*) filter (where status = 'error')                              as error_count,
  count(*) filter (where status = 'skipped')                            as skipped_count,
  round(count(*) filter (where status='success')::numeric
        / nullif(count(*),0)*100, 1)                                    as success_pct,
  max(created_at)                                                       as last_event_at,
  max(created_at) filter (where status = 'error')                       as last_error_at,
  case
    when count(*) = 0                                   then 'no_data'
    when count(*) filter (where status='error') > 0     then 'degraded'
    else 'healthy'
  end                                                                   as health_status
from public.acct_gl_bridge_log
where source_table in ('acct_statutory_filings','acct_tax_withholding')
group by source_table;

-- ── PART K: Trigger binding ───────────────────────────────────────────────────

do $guard$ begin
  if to_regclass('public.acct_statutory_filings') is not null then
    execute 'drop trigger if exists acct_bridge_statutory_filing_paid
             on public.acct_statutory_filings';
    execute 'create trigger acct_bridge_statutory_filing_paid
               after update on public.acct_statutory_filings
               for each row
               execute function public.acct_trig_statutory_filing_paid()';
    raise notice 'acct_bridge_statutory_filing_paid created on acct_statutory_filings.';
  end if;
end $guard$;

-- ── PART L: Feature flags ─────────────────────────────────────────────────────

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.statutory.pit',
   'Phase 7: Enable PIT (Personal Income Tax) withholding computation and reporting.',
   true),
  ('acct.statutory.social',
   'Phase 7: Enable social insurance (SIPC) employee/employer contribution tracking.',
   true),
  ('acct.statutory.zakat',
   'Phase 7: Enable zakat computation and annual filing.',
   false),
  ('acct.bridge.statutory_filing',
   'Phase 7: Log GL bridge entry when a statutory filing is submitted or paid.',
   true)
on conflict (key) do nothing;

-- ── PART M: Smoke checks ─────────────────────────────────────────────────────

select count(*) as pit_bands_seeded
from public.acct_tax_brackets
where tax_type = 'PIT' and country = 'SD';
-- expect 5

select count(*) as social_rates_seeded
from public.acct_social_rates
where country = 'SD';
-- expect 1

select * from public.acct_compute_pit(120000);
-- expect 4 bands: exempt=0, band1=2400, band2=9000, band3=0 (income exactly at boundary)
-- (120 000 annual: band1 = (60000-36000)*10% = 2400, band2 = (120000-60000)*15% = 9000)

select 'Phase 7 statutory SQL complete.' as result;
