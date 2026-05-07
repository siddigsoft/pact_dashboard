# Phase 7 — Statutory Reporting: Manual Apply Runbook

**File:** `supabase/migrations/accounting_phase7_statutory.sql`
**Database:** `abznugnirnlrqnnfkein` (pactdb)
**Prerequisite:** Phase 1 applied (needs `acct_fiscal_years`, `acct_periods`, `feature_flags`)
**Independent of:** Phases 4, 5, 6 — can apply any time after Phase 1

---

## What this migration creates

| Object | Type | Notes |
|---|---|---|
| `acct_tax_brackets` | Table | Progressive PIT bands — Sudan 2024 rates seeded (5 rows) |
| `acct_social_rates` | Table | Social insurance rates — Sudan 2024 seeded (employee 8%, employer 17%) |
| `acct_zakat_config` | Table | Annual zakat configuration (nisab threshold + 2.5% rate) |
| `acct_tax_withholding` | Table | Per-employee per-period withholding records |
| `acct_statutory_filings` | Table | Monthly/annual filing submissions with status workflow |
| `acct_compute_pit()` | RPC | Returns per-band PIT breakdown for a given annual salary |
| `acct_statutory_summary()` | RPC | Period-level aggregates for the statutory dashboard |
| `acct_flag_overdue_filings()` | Function | Marks filings past due_date as overdue — call from scheduler |
| `acct_trig_statutory_filing_paid()` | Trigger fn | GL bridge on filing → submitted / paid |
| `acct_bridge_statutory_filing_paid` | Trigger | Bound to `acct_statutory_filings` AFTER UPDATE |
| `v_acct_phase7_coverage` | View | Bridge health: success/error/skipped counts |
| 4 feature flags | Rows in `feature_flags` | See below |

---

## Feature flags inserted

| Key | Default | Purpose |
|---|---|---|
| `acct.statutory.pit` | **true** | PIT withholding computation + PIT filings |
| `acct.statutory.social` | **true** | Social insurance tracking |
| `acct.statutory.zakat` | **false** | Zakat — enable when annual zakat config row is added |
| `acct.bridge.statutory_filing` | **true** | GL bridge on filing submitted/paid |

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_phase7_statutory.sql`
4. Click **Run**

### Expected NOTICE

```
NOTICE:  acct_bridge_statutory_filing_paid created on acct_statutory_filings.
```

### Expected final result rows

```
pit_bands_seeded = 5
social_rates_seeded = 1
(4 rows from acct_compute_pit(120000) showing the band breakdown)
Phase 7 statutory SQL complete.
```

---

## Smoke tests (run after apply)

```sql
-- 1. PIT brackets seeded
select name, lower_bound, upper_bound, rate_pct
from acct_tax_brackets
where tax_type = 'PIT' and country = 'SD'
order by lower_bound;
-- expect 5 rows: 0%, 10%, 15%, 20%, 25%

-- 2. Social rates seeded
select employee_rate, employer_rate from acct_social_rates where country = 'SD';
-- expect: 8 | 17

-- 3. PIT RPC — test 240 000 SDG/year salary
select band_name, taxable_in_band, tax_in_band
from acct_compute_pit(240000);
-- Expected total PIT = (60000-36000)*10% + (120000-60000)*15% + (240000-120000)*20%
--                    = 2 400 + 9 000 + 24 000 = 35 400 SDG/year

-- 4. Feature flags
select key, is_enabled from feature_flags
where key like 'acct.statutory.%' or key = 'acct.bridge.statutory_filing';
-- expect 4 rows

-- 5. Trigger exists
select tgname from pg_trigger
where tgname = 'acct_bridge_statutory_filing_paid';
-- expect 1 row

-- 6. Coverage view (no data yet is fine)
select * from v_acct_phase7_coverage;
-- expect 0 rows (no events yet)

-- 7. Create a test withholding record then check summary
insert into acct_tax_withholding
  (employee_id, period_id, gross_salary, taxable_income, pit_amount,
   social_employee_amount, social_employer_amount, currency)
select
  (select id from profiles limit 1),
  (select id from acct_periods order by start_date desc limit 1),
  120000, 120000, 11400, 9600, 20400, 'SDG'
where exists (select 1 from profiles)
  and exists (select 1 from acct_periods);

select * from acct_statutory_summary();
-- expect 1 row with the values above
```

---

## Live test: Filing workflow

```sql
-- Create a draft filing for the current period
insert into acct_statutory_filings
  (filing_type, period_id, due_date, total_amount, currency)
select 'pit_monthly',
  (select id from acct_periods order by start_date desc limit 1),
  date_trunc('month', now())::date + interval '15 days',
  11400, 'SDG'
where exists (select 1 from acct_periods);

-- Submit it (triggers GL bridge log)
update acct_statutory_filings
set status = 'submitted', submitted_at = now()
where filing_type = 'pit_monthly' and status = 'draft'
order by created_at desc
limit 1;

-- Mark as paid (triggers second GL bridge log)
update acct_statutory_filings
set status = 'paid', paid_at = now(), payment_reference = 'TEST-REF-001'
where filing_type = 'pit_monthly' and status = 'submitted'
order by created_at desc
limit 1;

-- Verify GL bridge logs
select source_table, event_type, status, je_description, created_at
from acct_gl_bridge_log
where source_table = 'acct_statutory_filings'
order by created_at desc limit 5;
-- expect 2 rows: statutory_filing_submitted + statutory_filing_paid
```

---

## Rollback

See `docs/sql/PHASE7_STATUTORY_ROLLBACK.sql` to undo all objects.

---

## Phase 8 preview

Phase 8 — Audit-pack export + external auditor portal (writes Excel + PDF bundles from GL data).
