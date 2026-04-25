# PACT Accounting Module — Phase 1 Sprint Design

**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` §6 Phase 1
**Status:** Design ready; awaits §7 sign-off (`ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`)
**Sprint length:** 2–3 sprints (recommended split below)
**Sprint owner:** Engineering Lead + Finance Manager

---

## Goal

Stand up the **General Ledger foundation** so any service in PACT can post a
balanced, idempotent, audit-grade journal — with **fund accounting**,
**sanctions screening**, **Segregation-of-Duties enforcement**, and a
**posting-engine test suite** in place from day one.

Once Phase 1 ships, every later phase (HR → GL, AP → GL, AR → GL, etc.) is
just plumbing into a working ledger.

---

## Acceptance criteria *(copied from master plan §6 Phase 1)*

1. Any service can post a balanced journal via one RPC `acct_post_journal`.
2. Trial Balance RPC returns correct numbers (debits = credits, per period,
   per fund, per branch).
3. Sanctions block prevents posting to a sanctioned partner.
4. SoD matrix prevents the same user posting and approving the same journal.
5. Fund-restriction model is in place (every line tags an `acct_funds` row).
6. Posting-engine unit-test suite passes (≥ 95 % branch coverage).
7. Synthetic data generator produces a reproducible test ledger.
8. Feature-flag framework gates every new finance feature.
9. Arabic font registered for jsPDF; Arabic numerals render correctly.
10. Audit-trail visualiser renders changes from `hierarchy_audit_log` +
    new finance audit triggers.

---

## Sprint split (recommended)

### Sprint 1.1 — Schema + posting engine *(2 weeks)*
- DDL migrations.
- `acct_post_journal` RPC + balance-validation trigger.
- Trial Balance RPC.
- Posting-engine test suite.
- Synthetic data generator.
- Feature-flag framework.

### Sprint 1.2 — Sanctions + SoD + audit trail *(1.5 weeks)*
- `acct_sanctioned_parties` + nightly screening cron.
- `acct_screen_party` RPC + posting-time guard.
- SoD matrix tables + `acct_check_sod` RPC.
- 2FA enforcement on finance roles.
- Audit-trail visualiser page.
- Arabic jsPDF font registration.

---

## Schema *(DDL drafts)*

### `acct_funds` — fund-restriction model

```sql
create type acct_restriction_type as enum (
  'without_restriction',
  'with_restriction',
  'board_designated',
  'quasi_endowment'
);

create table public.acct_funds (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- e.g. 'GENERAL', 'USAID-EDU-2026'
  name_en         text not null,
  name_ar         text not null,
  restriction_type acct_restriction_type not null,
  donor_partner_id uuid references public.partners(id),
  start_date      date,
  end_date        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index idx_acct_funds_active on public.acct_funds(is_active)
  where is_active;

alter table public.acct_funds enable row level security;
-- RLS: read = all authenticated; write = finance / accountant / super_admin
```

### `acct_accounts` — Chart of Accounts

```sql
create type acct_account_type as enum (
  'asset', 'liability', 'equity', 'revenue', 'expense'
);

create type acct_account_subtype as enum (
  'current_asset','non_current_asset',
  'current_liability','non_current_liability',
  'contributed_equity','retained_equity',
  'operating_revenue','non_operating_revenue',
  'program_expense','mng_expense','fundraising_expense',
  'cogs','other_expense'
);

create table public.acct_accounts (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- '1100', '4200-USAID', etc.
  name_en         text not null,
  name_ar         text not null,
  account_type    acct_account_type not null,
  subtype         acct_account_subtype not null,
  parent_id       uuid references public.acct_accounts(id),
  is_active       boolean not null default true,
  is_postable     boolean not null default true,   -- false for header / roll-up rows
  branch_id       uuid,                            -- nullable until Phase 4
  version         int not null default 1,          -- COA versioning for historical reporting
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index idx_acct_accounts_type on public.acct_accounts(account_type);
create index idx_acct_accounts_parent on public.acct_accounts(parent_id);
```

### `acct_fiscal_years` + `acct_fiscal_periods`

```sql
create type acct_period_status as enum ('open','soft_closed','hard_closed','locked');

create table public.acct_fiscal_years (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- 'FY2026'
  start_date      date not null,
  end_date        date not null,
  is_closed       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.acct_fiscal_periods (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.acct_fiscal_years(id),
  period_no       int not null,                    -- 1..12 monthly
  start_date      date not null,
  end_date        date not null,
  status          acct_period_status not null default 'open',
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id),
  unique (fiscal_year_id, period_no)
);

create index idx_acct_fp_status on public.acct_fiscal_periods(status);
create index idx_acct_fp_dates on public.acct_fiscal_periods(start_date, end_date);
```

### `acct_journal_entries` + `acct_journal_lines` *(partitioned)*

```sql
create type acct_journal_status as enum (
  'draft','pending_approval','posted','reversed','rejected'
);

create table public.acct_journal_entries (
  id                uuid primary key default gen_random_uuid(),
  entry_no          bigserial not null unique,
  period_id         uuid not null references public.acct_fiscal_periods(id),
  posting_date      date not null,
  description_en    text not null,
  description_ar    text,
  source_type       text not null,                 -- 'payroll','wallet','manual','expense', etc.
  source_id         uuid,                          -- FK to source row (loose-typed)
  status            acct_journal_status not null default 'draft',
  branch_id         uuid,                          -- nullable until Phase 4
  idempotency_key   text not null unique,
  posted_at         timestamptz,
  posted_by         uuid references public.profiles(id),
  reversed_by_entry_id uuid references public.acct_journal_entries(id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references public.profiles(id)
);

create index idx_acct_je_period on public.acct_journal_entries(period_id);
create index idx_acct_je_source on public.acct_journal_entries(source_type, source_id);
create index idx_acct_je_status on public.acct_journal_entries(status);

create table public.acct_journal_lines (
  id                uuid primary key default gen_random_uuid(),
  entry_id          uuid not null references public.acct_journal_entries(id) on delete cascade,
  line_no           int not null,
  account_id        uuid not null references public.acct_accounts(id),
  fund_id           uuid not null references public.acct_funds(id),
  function          text not null check (function in ('program','mng','fundraising','none')),
  project_id        uuid,                          -- references projects(id) if exists
  grant_id          uuid,                          -- references acct_grants(id) — Phase 2.5
  cost_center_id    uuid,                          -- references departments(id) in Phase 1
  partner_id        uuid references public.partners(id),
  -- Money columns are pairs:
  original_amount   numeric(20,4) not null,
  original_currency text not null,
  functional_amount numeric(20,4) not null,
  functional_currency text not null default 'SDG',
  fx_rate           numeric(20,8),
  debit_credit      char(2) not null check (debit_credit in ('DR','CR')),
  description       text,
  unique (entry_id, line_no)
) partition by range (entry_id);   -- partitioned by period via parent FK; bucket strategy below

-- Partition strategy: monthly partitions named acct_journal_lines_yYYYY_mMM,
-- created by a pg_cron job at the start of each fiscal period.

create index idx_acct_jl_account_period on public.acct_journal_lines(account_id);
create index idx_acct_jl_fund on public.acct_journal_lines(fund_id);
create index idx_acct_jl_project on public.acct_journal_lines(project_id);
create index idx_acct_jl_grant on public.acct_journal_lines(grant_id);
create index idx_acct_jl_cost_center on public.acct_journal_lines(cost_center_id);
```

### `acct_sanctioned_parties` + `acct_aml_alerts`

```sql
create type acct_sanctions_list as enum ('OFAC_SDN','EU_CONS','UN_CONS','HMT_UK','DFAT_AU');

create table public.acct_sanctioned_parties (
  id              uuid primary key default gen_random_uuid(),
  list            acct_sanctions_list not null,
  external_id     text not null,                   -- list provider's ID
  full_name       text not null,
  aliases         text[] default '{}',
  country         text,
  match_hash      text not null,                   -- normalised for fuzzy match
  raw             jsonb not null,
  loaded_at       timestamptz not null default now(),
  unique (list, external_id)
);

create index idx_acct_sp_match_hash on public.acct_sanctioned_parties(match_hash);

create type acct_aml_status as enum ('open','false_positive','blocked','escalated');

create table public.acct_aml_alerts (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners(id),
  matched_party_id uuid not null references public.acct_sanctioned_parties(id),
  match_score     numeric(5,2) not null,
  status          acct_aml_status not null default 'open',
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id),
  resolution_notes text,
  created_at      timestamptz not null default now()
);
```

### `acct_sod_rules` + `acct_sod_violations`

```sql
create table public.acct_sod_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text not null,
  forbidden_pair  text[] not null,                 -- e.g. ['journal.post','journal.approve']
  scope           text not null,                   -- 'same_entry','same_vendor','same_period'
  is_active       boolean not null default true
);

-- Seed rules:
-- ('SOD-1','Same user cannot post and approve a journal',ARRAY['journal.post','journal.approve'],'same_entry')
-- ('SOD-2','Same user cannot create a vendor and approve payment to it',ARRAY['vendor.create','payment.approve'],'same_vendor')
-- ('SOD-3','Same user cannot approve a payroll run that includes them',ARRAY['payroll.approve','payroll.payee'],'same_run')
-- ('SOD-4','Same user cannot initiate and release a bank transfer',ARRAY['transfer.initiate','transfer.release'],'same_transfer')

create table public.acct_sod_violations (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null references public.acct_sod_rules(id),
  user_id         uuid not null references public.profiles(id),
  attempted_action text not null,
  context         jsonb not null,
  blocked_at      timestamptz not null default now()
);
```

### `feature_flags`

```sql
create table public.feature_flags (
  key             text primary key,
  description     text not null,
  is_enabled      boolean not null default false,
  branch_scope    uuid[] default '{}',             -- empty = global; populated = per-branch
  rolled_out_pct  int default 100 check (rolled_out_pct between 0 and 100),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);

-- Helper SQL function:
create or replace function public.feature_enabled(p_key text, p_branch_id uuid default null)
returns boolean language sql stable as $$
  select coalesce((
    select is_enabled
      and (branch_scope = '{}' or p_branch_id = any(branch_scope))
      and (rolled_out_pct = 100 or (hashtext(p_key||coalesce(p_branch_id::text,''))%100) < rolled_out_pct)
    from public.feature_flags where key = p_key
  ), false);
$$;
```

---

## RPC signatures

### `acct_post_journal`

```sql
create or replace function public.acct_post_journal(
  p_payload          jsonb,            -- { period_id, posting_date, description_en, description_ar,
                                       --   source_type, source_id, branch_id, lines: [{...}, ...] }
  p_idempotency_key  text
) returns uuid                         -- returns acct_journal_entries.id
language plpgsql security definer as $$
declare
  v_entry_id uuid;
  v_user_id  uuid := auth.uid();
begin
  -- 1. Idempotency: if key exists, return existing entry id
  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = p_idempotency_key;
  if found then return v_entry_id; end if;

  -- 2. Validate period is open
  perform 1 from public.acct_fiscal_periods
    where id = (p_payload->>'period_id')::uuid and status in ('open','soft_closed');
  if not found then
    raise exception 'PERIOD_CLOSED';
  end if;

  -- 3. Validate balance: sum(DR) == sum(CR) per fund
  --    (raise BALANCE_MISMATCH on failure)
  -- 4. Validate every account is_active and is_postable
  -- 5. Sanctions check on every line.partner_id (raise SANCTIONS_BLOCK)
  -- 6. SoD check: caller must not be the original creator of source row when source_type implies separation
  -- 7. INSERT entry + lines (status='posted', posted_at=now, posted_by=v_user_id)
  -- 8. NOTIFY 'journal_posted' for materialised view refresh
  -- 9. Return v_entry_id
end; $$;
```

**Error codes** (Postgres exceptions): `PERIOD_CLOSED`, `BALANCE_MISMATCH`,
`ACCOUNT_INACTIVE`, `ACCOUNT_NOT_POSTABLE`, `SANCTIONS_BLOCK`, `SOD_VIOLATION`,
`MISSING_FUND`, `MISSING_FUNCTION`.

### `acct_screen_party`

```sql
create or replace function public.acct_screen_party(p_partner_id uuid)
returns table (matched boolean, alert_id uuid)
language plpgsql as $$ ... $$;
```

### `acct_check_sod`

```sql
create or replace function public.acct_check_sod(
  p_user_id uuid,
  p_action  text,                -- 'journal.post','journal.approve', etc.
  p_context jsonb                -- carries the entity ids needed to evaluate scope
) returns boolean                -- true = allowed; false = blocked + violation logged
language plpgsql security definer as $$ ... $$;
```

### `acct_trial_balance`

```sql
create or replace function public.acct_trial_balance(
  p_period_id  uuid,
  p_branch_id  uuid default null,
  p_fund_id    uuid default null
) returns table (
  account_id   uuid,
  account_code text,
  account_name_en text,
  account_name_ar text,
  debit_total  numeric(20,4),
  credit_total numeric(20,4),
  net_balance  numeric(20,4)
) language sql stable as $$ ... $$;
```

### `acct_create_period_partition` *(cron-invoked)*

Creates the next month's `acct_journal_lines_yYYYY_mMM` partition.

---

## RLS policies *(per role)*

| Table | super_admin | finance | accountant | auditor | other |
|---|---|---|---|---|---|
| `acct_funds` | RW | RW | R | R | R |
| `acct_accounts` | RW | RW (with maker-checker) | R | R | R |
| `acct_fiscal_years` | RW | RW | R | R | R |
| `acct_fiscal_periods` | RW | RW | R | R | R |
| `acct_journal_entries` | RW | RW (post + approve segregated by SoD) | RW (post only) | R | none |
| `acct_journal_lines` | R (immutable; no UPDATE) | R | R | R | none |
| `acct_sanctioned_parties` | RW | R | R | R | none |
| `acct_aml_alerts` | RW | RW (resolve) | R | R | none |
| `acct_sod_rules` | RW | R | R | R | none |
| `acct_sod_violations` | RW | R | R | R | none |
| `feature_flags` | RW | RW | R | R | R |

**Universal rule:** `acct_journal_lines` has **no UPDATE / DELETE policy at
all** — immutability enforced at the table level. Reversal goes through
`acct_post_journal` with a contra-entry pointing at `reversed_by_entry_id`.

---

## Test matrix *(posting-engine unit tests)*

Each row is one test. Target ≥ 95 % branch coverage.

| Category | Test |
|---|---|
| **Balance** | DR == CR single-currency single-fund — passes |
| **Balance** | DR != CR — raises BALANCE_MISMATCH |
| **Balance** | DR == CR overall but not per-fund — raises BALANCE_MISMATCH |
| **Period** | Posting to open period — passes |
| **Period** | Posting to soft_closed period — passes (with warning) |
| **Period** | Posting to hard_closed period — raises PERIOD_CLOSED |
| **Period** | Posting to locked period — raises PERIOD_CLOSED |
| **Account** | Posting to inactive account — raises ACCOUNT_INACTIVE |
| **Account** | Posting to header (non-postable) account — raises ACCOUNT_NOT_POSTABLE |
| **FX** | Multi-currency line with explicit fx_rate — functional_amount calculated correctly |
| **FX** | Missing fx_rate when original_currency != functional_currency — raises FX_RATE_MISSING |
| **Sanctions** | Posting line with partner_id matching OFAC entry — raises SANCTIONS_BLOCK |
| **Sanctions** | Posting line with partner_id matching false-positive resolved alert — passes |
| **SoD** | Same user posting and approving same entry — raises SOD_VIOLATION |
| **SoD** | Different users posting and approving — passes |
| **Idempotency** | Same idempotency_key called twice — second returns same entry_id, no duplicate rows |
| **Fund** | Line missing fund_id — raises MISSING_FUND |
| **Function** | Expense line missing function — raises MISSING_FUNCTION |
| **Audit** | Posted entry creates row in audit log — verified |
| **Reversal** | Posting a contra-entry — reversed_by_entry_id linked correctly |
| **Reversal** | Attempting UPDATE on acct_journal_lines — fails (no policy) |
| **Reversal** | Attempting DELETE on acct_journal_lines — fails (no policy) |
| **Trial Balance** | TB after one balanced entry — debit_total = credit_total per fund |
| **Trial Balance** | TB filtered by branch — only matching lines included |
| **Synthetic** | Generator produces a 1,000-entry month, TB balances |
| **Performance** | TB on 100k-line period returns under 500 ms |
| **i18n** | Description rendered with mixed EN/AR — RTL preserved on PDF export |
| **jsPDF** | Arabic numerals render correctly in exported PDF |
| **Idempotency** | Concurrent calls with same idempotency_key — only one row created |

---

## Synthetic data generator

Edge function `acct-seed-synthetic` (or a SQL function) producing:
- 1 fiscal year, 12 monthly periods (FY2026)
- Sudan COA seed (≈ 80 accounts)
- 4 funds: General (unrestricted), USAID-EDU-2026 (with restriction),
  Board Reserve (board_designated), Endowment (quasi)
- 1,000 random balanced entries spread across the year
- 5 partners — 1 of which matches an OFAC test entry to verify the block
- 3 dummy users with distinct roles to exercise SoD

Run from Edge Function with `?reset=true` to wipe + reseed in non-production
environments only (guarded by `is_production` env check).

---

## Feature-flag bootstrap

Initial flags loaded by Phase 1 migration:

| Key | Default | Description |
|---|---|---|
| `acct.posting_engine.enabled` | true | Master switch |
| `acct.sanctions.block_on_match` | true | If false, sanctions hits log only |
| `acct.sod.enforce` | true | If false, violations log only |
| `acct.fund_required` | true | Require fund_id on every line |
| `acct.function_required` | true | Require function on every expense line |
| `acct.parallel_run.enabled` | false | Phase 1 cut-over flag — flips during parallel run |

---

## Audit-trail visualiser

- New page `/finance/audit-trail` (super_admin + auditor + finance only).
- Reads from existing `hierarchy_audit_log` + new `acct_aml_alerts` +
  `acct_sod_violations` + per-table audit triggers on `acct_funds`,
  `acct_accounts`, `acct_fiscal_periods`, `feature_flags`.
- Filter by date range, table, user, change type.
- CSV export.

---

## Notification triggers introduced in Phase 1

Reuse `NotificationTriggerService` — no new framework. New event types:

- `acct.journal.posted` — to creator (in-app) + finance role (in-app + email).
- `acct.sanctions.hit` — to compliance role (in-app + email + WhatsApp).
- `acct.sod.violation` — to internal-audit role (in-app + email).
- `acct.period.closed` — to finance + auditor roles (in-app + email).
- `acct.feature_flag.changed` — to super_admin (in-app).

All bilingual EN/AR, all routed through the existing dispatcher.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Sanctions list ingestion lag | Nightly cron + manual force-refresh button; alert if last load > 36 h ago |
| Idempotency races under high concurrency | Unique constraint on `idempotency_key` is the source of truth; tested with concurrent harness |
| Partition creation falling behind | `acct_create_period_partition` cron alerts if next-month partition missing 7 days before period start |
| RLS bypass via security-definer RPC | Every security-definer RPC explicitly checks `auth.uid()` role before mutating |
| Arabic font missing in jsPDF | Font registered + smoke-tested in CI on every PR |
| Posting RPC slow on large entries | EXPLAIN ANALYZE benchmarks gate every PR touching the RPC |

---

## Out-of-scope for Phase 1 *(explicit)*

- Donor regimes / grants / pledges → Phase 2.5
- Real `branches` table → Phase 4
- Cost-center separate table → Phase 4 (use `departments` proxy now)
- AP / AR cycles → Phase 2
- Bank-feed integration → Phase 6
- GraphQL endpoint → Phase 5
- Reporting layer routes → Phase 3
- Lease accounting, capital projects → Phase 4
- Inventory / GIK → Phase 6 (per Q-E2 default)

---

## Definition of Done

1. All migrations applied to staging without data loss.
2. All test matrix items green in CI.
3. Synthetic ledger seeds without errors and produces a balanced TB.
4. Sanctions block prevents a payment journal in a manual smoke test.
5. SoD block prevents same-user post + approve in a manual smoke test.
6. Audit-trail page renders for the seeded run.
7. Feature-flag toggle disables the posting engine gracefully (returns
   `FEATURE_DISABLED` instead of mutating).
8. PDF export of TB renders Arabic + Western numerals correctly.
9. Code-review architect signs off.
10. Sign-off sheet (`ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`) attached to the
    sprint ticket.

---

*Phase 1 design ends here. Subsequent phases get their own design docs (one
per phase) — issued at the start of each sprint, never batched ahead.*
