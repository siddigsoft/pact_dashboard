-- =============================================================================
-- PACT Accounting — Phase 7 Hot-patch
-- Fixes: accounting_phase7_statutory.sql failed with
--   "ERROR 42601: syntax error at or near 'super_admin'"
-- Cause: Double-escaped quotes (''role'') inside dollar-quoted EXECUTE string.
--        Inside $pol$...$pol$ single quotes need no escaping.
-- =============================================================================
-- Run this ONCE in Supabase SQL Editor (abznugnirnlrqnnfkein).
-- The main migration file has also been fixed for future reference.
-- All blocks use IF NOT EXISTS guards — safe to re-run.
-- =============================================================================

-- ── STEP 1: Fix acct_tax_brackets modify policy (partially created) ──────────

do $$ begin
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
    raise notice 'tax_brackets_modify policy created.';
  else
    raise notice 'tax_brackets_modify already exists — skipping.';
  end if;
end $$;

-- ── STEP 2: Social Insurance Rates ──────────────────────────────────────────

create table if not exists public.acct_social_rates (
  id              uuid        primary key default gen_random_uuid(),
  country         text        not null default 'SD',
  employee_rate   numeric(6,4) not null,
  employer_rate   numeric(6,4) not null,
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

insert into public.acct_social_rates
  (country, employee_rate, employer_rate, effective_from, notes)
values
  ('SD', 8, 17, '2024-01-01',
   'Sudan Social Insurance & Pensions Commission (SIPC) rates 2024')
on conflict do nothing;

-- ── STEP 3: Zakat Configuration ───────────────────────────────────────────────

create table if not exists public.acct_zakat_config (
  id              uuid        primary key default gen_random_uuid(),
  fiscal_year_id  uuid        references public.acct_fiscal_years(id) on delete set null,
  country         text        not null default 'SD',
  nisab_sdg       numeric(20,2) not null,
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

-- ── STEP 4: Tax Withholding ───────────────────────────────────────────────────

create table if not exists public.acct_tax_withholding (
  id                      uuid        primary key default gen_random_uuid(),
  employee_id             uuid        not null references public.profiles(id) on delete restrict,
  period_id               uuid        not null references public.acct_fiscal_periods(id) on delete restrict,
  gross_salary            numeric(20,2) not null,
  taxable_income          numeric(20,2) not null,
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

create or replace function public.update_acct_tax_withholding_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_tax_wh_updated_at on public.acct_tax_withholding;
create trigger acct_tax_wh_updated_at
  before update on public.acct_tax_withholding
  for each row execute function public.update_acct_tax_withholding_updated_at();

-- ── STEP 5: Statutory Filings ─────────────────────────────────────────────────

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
  reference_number  text,
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

create or replace function public.update_acct_statutory_filings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_statutory_filings_updated_at on public.acct_statutory_filings;
create trigger acct_statutory_filings_updated_at
  before update on public.acct_statutory_filings
  for each row execute function public.update_acct_statutory_filings_updated_at();

-- ── STEP 6: acct_compute_pit() RPC ───────────────────────────────────────────

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

-- ── STEP 7: acct_statutory_summary() RPC ─────────────────────────────────────

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

-- ── STEP 8: GL bridge trigger function ───────────────────────────────────────

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

  if (old.status is distinct from new.status) and new.status = 'paid' then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status,
      je_reference, je_description
    ) values (
      'acct_statutory_filings', new.id, 'statutory_filing_paid', 'success',
      new.payment_reference,
      format('Statutory filing paid — type: %s | amount: %s %s | ref: %s | paid: %s',
        new.filing_type, new.total_amount, new.currency,
        coalesce(new.reference_number,'n/a'),
        coalesce(new.paid_at::text, now()::text))
    );
  end if;

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

-- ── STEP 9: acct_flag_overdue_filings() ──────────────────────────────────────

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

-- ── STEP 10: Coverage view ────────────────────────────────────────────────────

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

-- ── STEP 11: Trigger binding ──────────────────────────────────────────────────

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

-- ── STEP 12: Feature flags ────────────────────────────────────────────────────

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.statutory.pit',
   'Phase 7: Enable PIT (Personal Income Tax) withholding computation and monthly/annual filing workflow.',
   true),
  ('acct.statutory.social',
   'Phase 7: Enable social insurance (SIPC) employee 8% + employer 17% contribution tracking and monthly filings.',
   true),
  ('acct.statutory.zakat',
   'Phase 7: Enable zakat computation (2.5% on net zakatable assets above nisab). Enable after adding a zakat config row.',
   false),
  ('acct.bridge.statutory_filing',
   'Phase 7: Log GL bridge entry when a statutory filing is submitted or paid.',
   true)
on conflict (key) do nothing;

-- ── STEP 13: Smoke checks ─────────────────────────────────────────────────────

select count(*) as pit_bands_seeded
from public.acct_tax_brackets
where tax_type = 'PIT' and country = 'SD';
-- expect 5

select count(*) as social_rates_seeded
from public.acct_social_rates where country = 'SD';
-- expect 1

select * from public.acct_compute_pit(240000);
-- expect 4 bands; total PIT = 2400 + 9000 + 24000 = 35 400 SDG/year

select 'Phase 7 hot-patch complete.' as result;
