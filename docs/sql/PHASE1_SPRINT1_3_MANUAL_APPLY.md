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

### ⚠️ Important: what "read-only" means for the test suite

The test suite is wrapped in `BEGIN; … ROLLBACK;` so **no journal-entry rows
or feature-flag changes persist**. There is one exception: the
`acct_journal_entries.entry_no` sequence advances during T01/T17/T18/T19/T20
because PostgreSQL sequence increments survive `ROLLBACK` by design. This is
harmless (entry numbers are display-only and the sequence is unbounded) but
expect your next real `entry_no` to jump by ~6 per suite run.

If you ever run `SELECT acct_run_test_suite(...)` **without** wrapping it in
`BEGIN; … ROLLBACK;` you will write real journal-entry rows into pactdb. Do
not do that. The runbook step below shows the correct invocation.

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
  "funds_inserted": 3,            // 3 if a public.acct_funds row with code='GENERAL' already existed; 4 otherwise
  "partners_inserted": 2,         // 0 if your DB has no public.partners table OR the partners table has no recognised name column (name / full_name / partner_name)
  "sanctions_inserted": 1,        // 0 in the same cases as partners_inserted (sanctions are only inserted when a synthetic partner was inserted to match)
  "entries_inserted": 25,
  "entries_skipped": 0,
  "fy_id": "...",
  "period_count": 12
}
```

Verify counts match registry.

**Use the formula, not hardcoded totals** — the seed makes branching choices
based on what already exists in pactdb (whether `acct_funds.code='GENERAL'`
exists, whether the `partners` table exists at all). Read `funds_inserted`,
`entries_inserted`, `partners_inserted`, `sanctions_inserted` straight off
the JSON returned by `acct_seed_synthetic` in the previous step and use
that as your ground truth:

```text
expected total markers = funds_inserted
                       + entries_inserted
                       + partners_inserted
                       + sanctions_inserted
```

Now check the registry:

```sql
-- Per-table counts must match the JSON exactly:
select table_name, count(*)
  from public.acct_synthetic_marker
 group by table_name
 order by table_name;

-- Total must match the formula above:
select count(*) from public.acct_synthetic_marker;
```

For reference, here are all four valid scenarios for a 25-entry seed:

| GENERAL fund pre-existed? | partners table exists? | funds | entries | partners | sanctions | **total markers** |
|---|---|---|---|---|---|---|
| yes | yes | 3 | 25 | 2 | 1 | **31** |
| no  | yes | 4 | 25 | 2 | 1 | **32** |
| yes | no  | 3 | 25 | 0 | 0 | **28** |
| no  | no  | 4 | 25 | 0 | 0 | **29** |

### S3 — Re-run with reset (idempotency)

```sql
select public.acct_seed_synthetic(p_target_entries := 25, p_reset := true);
select count(*) from public.acct_synthetic_marker;
-- expect: exactly the same total your S2 row showed (28, 29, 31, or 32 per
-- the table above). The reset wipes every S2 row and re-creates only what
-- the new seed call inserts, so the count must equal what S2 produced —
-- never higher, never lower.
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

> ⚠️ Calling `acct_seed_synthetic(0, true)` does **not** leave the marker
> registry empty: the function always re-creates the fund / partner /
> sanctions fixtures after the reset, then iterates the entries loop zero
> times. So that call would leave you with `funds_inserted +
> partners_inserted + sanctions_inserted` markers, not zero.

You have two clean options. Pick one:

**S6a — Wipe synthetic data only, keep Sprint 1.3 functions installed**
(useful if you intend to re-seed for further testing later):

```sql
-- Same data-wipe logic as the rollback file, with table-existence guards.
do $$
begin
  if to_regclass('public.acct_synthetic_marker') is null then
    raise notice 'acct_synthetic_marker not present — nothing to wipe.';
    return;
  end if;

  if to_regclass('public.acct_journal_lines') is not null then
    delete from public.acct_journal_lines
      where entry_id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_journal_entries'
      );
  end if;

  if to_regclass('public.acct_journal_entries') is not null then
    delete from public.acct_journal_entries
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_journal_entries'
      );
  end if;

  if to_regclass('public.acct_aml_alerts') is not null then
    delete from public.acct_aml_alerts
      where partner_id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'partners'
      );
  end if;

  if to_regclass('public.acct_sanctioned_parties') is not null then
    delete from public.acct_sanctioned_parties
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_sanctioned_parties'
      );
  end if;

  if to_regclass('public.partners') is not null then
    execute 'delete from public.partners where id in (select row_id from public.acct_synthetic_marker where table_name = ''partners'')';
  end if;

  if to_regclass('public.acct_funds') is not null then
    delete from public.acct_funds
      where id in (
        select row_id from public.acct_synthetic_marker
         where table_name = 'acct_funds'
      );
  end if;

  -- Finally clear the registry itself
  truncate public.acct_synthetic_marker;
end $$;

select count(*) from public.acct_synthetic_marker;  -- expect 0
```

**S6b — Completely remove Sprint 1.3 (data + functions + marker table)**
(use this if you no longer want the test/seed surface in pactdb at all):

Paste `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql` and run it. Sprint 1.1 and
Sprint 1.2 surfaces (`acct_post_journal`, `acct_screen_party`,
`acct_check_sod`, audit triggers, etc.) remain fully operational.

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
