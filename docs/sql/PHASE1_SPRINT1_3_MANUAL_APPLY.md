# Phase 1 · Sprint 1.3 — Manual Apply Runbook

> Posting-engine unit-test suite + synthetic data generator. Closes Phase 1
> acceptance criteria #6 (test suite ≥ 95% branch coverage) and #7
> (reproducible synthetic data generator).
>
> **Apply target:** `pactdb` (project ref `abznugnirnlrqnnfkein`)
> **Migration file:** `supabase/migrations/20260515_acct_phase1_sprint1_3.sql`
> **Rollback file:** `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql`

---

## Pre-flight

1. ✅ Sprint 1.1 has been clean in pactdb for **≥ 24 hours**.
2. ✅ Sprint 1.2 has been clean in pactdb for **≥ 24 hours**.
3. Confirm in the SQL editor:
   ```sql
   select count(*) from public.acct_journal_entries;        -- baseline
   select count(*) from public.acct_funds;                   -- ≥ 1
   select count(*) from public.acct_fiscal_periods;          -- ≥ 12
   select count(*) from public.acct_sanctioned_parties;      -- baseline
   ```
   Record these baselines in §Sign-off below.

---

## Apply procedure

### Step 1 — Paste the migration

Open `supabase/migrations/20260515_acct_phase1_sprint1_3.sql`, copy its
**entire contents**, paste into the pactdb SQL editor, run.

Expected result: `Success. No rows returned`.

### Step 2 — Verify objects landed

```sql
select to_regclass('public.acct_synthetic_marker') as marker_table;
-- expect: public.acct_synthetic_marker (not null)

select proname from pg_proc
 where proname in ('acct_seed_synthetic','acct_run_test_suite');
-- expect 2 rows
```

---

## Smoke tests

### S1 — Run the unit-test suite (READ-ONLY: caller wraps in ROLLBACK)

You need two real user IDs in pactdb:
- A finance / accountant / super_admin user → `<FIN_ID>`
- A user with any other role (data_collector, manager, etc.) → `<NONFIN_ID>`

Find them:
```sql
select id, email, role from public.profiles
 where role in ('super_admin','finance','accountant') limit 5;
select id, email, role from public.profiles
 where role not in ('super_admin','finance','accountant') limit 5;
```

Then run the suite **inside a transaction you will roll back**:

```sql
begin;
set local request.jwt.claim.sub = '<FIN_ID>';
select * from public.acct_run_test_suite(
  '<FIN_ID>'::uuid,
  '<NONFIN_ID>'::uuid
);
rollback;
```

Expected: 20 rows. Every row's `status` column should be `PASS` or `SKIP`
(the sanctions test skips if your `partners` table has no recognised name
column). **Any `FAIL` row is a regression — do not proceed; capture the
`detail` column and escalate.**

Record the PASS / FAIL / SKIP counts in §Sign-off.

### S2 — Seed a small synthetic ledger

```sql
-- Authenticated as a super_admin user in the editor
select public.acct_seed_synthetic(p_target_entries := 25);
```

Expected: returns a JSON object like
```json
{
  "reset_performed": false,
  "funds_inserted": 3,
  "partners_inserted": 2,
  "sanctions_inserted": 1,
  "entries_inserted": 25,
  "entries_skipped": 0,
  "fy_id": "...",
  "period_count": 12
}
```

Verify counts match registry:
```sql
select table_name, count(*)
  from public.acct_synthetic_marker
 group by table_name
 order by table_name;
-- expect: acct_funds 3, acct_journal_entries 25, partners 2, acct_sanctioned_parties 1
```

### S3 — Re-run with reset (idempotency)

```sql
select public.acct_seed_synthetic(p_target_entries := 25, p_reset := true);
select count(*) from public.acct_synthetic_marker;
-- expect: 31 (3 funds + 25 entries + 2 partners + 1 sanctions)
```

### S4 — Verify trial balance still balances

```sql
select sum(debit_total) as dr, sum(credit_total) as cr
  from public.acct_trial_balance(
    (select id from public.acct_fiscal_periods
      where fiscal_year_id = (select id from public.acct_fiscal_years where code='FY2026')
        and period_no = 1)
  );
-- expect: dr = cr (both > 0)
```

### S5 — Production guardrail

Verify the seed refuses to run against a "live cutover" environment:
```sql
update public.feature_flags set is_enabled = true where key = 'acct.parallel_run.enabled';
select public.acct_seed_synthetic(p_target_entries := 1);
-- expect: ERROR: PRODUCTION_GUARD: ...

update public.feature_flags set is_enabled = false where key = 'acct.parallel_run.enabled';
```

### S6 — Cleanup (optional, if you do not want synthetic data left in pactdb)

```sql
-- Wipe everything we registered, leaving real data untouched:
select public.acct_seed_synthetic(p_target_entries := 0, p_reset := true);
select count(*) from public.acct_synthetic_marker;  -- expect 0
```

---

## Sign-off log

| Step | Run by | Run at | Result | Notes |
|---|---|---|---|---|
| Baselines (counts) | | | JE=__ Funds=__ Periods=__ Sanc=__ | |
| Step 1 — migration applied | | | | |
| Step 2 — objects verified | | | | |
| S1 — test suite | | | __ PASS / __ FAIL / __ SKIP | If any FAIL: do NOT mark green, capture detail |
| S2 — seed 25 entries | | | | |
| S3 — reset re-seed | | | | |
| S4 — trial balance balanced | | | | |
| S5 — production guardrail | | | | |
| S6 — cleanup (optional) | | | | |
| Sprint 1.3 SIGNED OFF in pactdb | | | | Update STATUS_DASHBOARD.md §3 apply column to ✅ + date |

---

## If anything fails

1. Capture the exact error from the SQL editor.
2. Apply `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql` to remove Sprint 1.3 objects.
3. Sprint 1.1 + 1.2 are unaffected by the rollback.
4. Report back with the captured error so the agent can patch.
