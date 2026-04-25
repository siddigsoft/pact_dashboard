# PACT Accounting — Phase 1 Sprint 1.1 · Manual Apply Runbook

**Migration:** `supabase/migrations/20260501_acct_phase1_sprint1_1.sql`
**Target DB:** `pactdb` (project ref `abznugnirnlrqnnfkein`) — **production**
**Apply method:** **MANUAL only** — paste into Supabase SQL Editor
**Sign-off prerequisite:** ✅ FULLY SIGNED OFF 2026-04-25 (`docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`)
**Estimated duration:** 5 min apply · 10 min smoke test · 15 min total
**Reversibility:** Full rollback available — `docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql`

> ⚠️ **NEVER** apply this from Replit, npm scripts, or `db:push`. PACT's
> standing rule: every accounting migration is hand-pasted into the pactdb
> SQL editor by an authorised engineer. Do not bypass.

---

## What Sprint 1.1 delivers

The migration creates the General Ledger foundation:

| Object | Purpose |
|---|---|
| 5 enums (`acct_restriction_type`, `acct_account_type`, `acct_account_subtype`, `acct_period_status`, `acct_journal_status`) | Strong typing for the ledger |
| `acct_funds` | Fund-restriction model (per donor + restriction type) |
| `acct_accounts` | Chart of Accounts (header + postable rows, version-aware) |
| `acct_fiscal_years` + `acct_fiscal_periods` | Period close engine |
| `acct_journal_entries` + `acct_journal_lines` | The double-entry ledger itself; lines are immutable |
| `feature_flags` + `feature_enabled()` | Branch-scoped, gradual-rollout flag framework |
| `acct_post_journal(jsonb, text)` | The single posting RPC — idempotent, balance-validated, fund-aware |
| `acct_trial_balance(uuid, uuid, uuid)` | Trial Balance per period / branch / fund |
| RLS policies | Per-role read/write matrix; lines immutable; entries write-only via RPC |
| Seeds | FY2026 (12 monthly periods), GENERAL fund, 7 root header accounts |

Acceptance criteria from the Phase 1 design doc satisfied: **#1, #2, #5, #8.**
Deferred to Sprint 1.2: **#3 sanctions, #4 SoD, #9 Arabic font, #10 audit-trail viz.**
Deferred to Sprint 1.3: **#6 unit tests, #7 synthetic data generator.**

---

## Prerequisites

1. You have access to **pactdb** SQL Editor as a service-role user.
2. Phase 0 HR audit migrations are already applied (`HR_AUDIT_MANUAL_APPLY.sql`
   rev 3 + `HR_AUDIT_FIX_PATCH.sql` rev 2). The new migration depends on
   `public.profiles` and `public.partners`.
3. You have read the rollback file so you know how to undo.
4. Stakeholder sign-off recorded in
   `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md` (✅ done 2026-04-25).

---

## Apply procedure

### Step 1 — Pre-flight checks (run first, in pactdb SQL editor)

```sql
-- Confirm we're on pactdb (not WFP/MMP/SuperApp)
select current_database();
-- Expected: postgres on project abznugnirnlrqnnfkein

-- Confirm prerequisites exist
select to_regclass('public.profiles') is not null as has_profiles,
       to_regclass('public.partners') is not null as has_partners,
       to_regclass('public.departments') is not null as has_departments;
-- Expected: all three true

-- Confirm no acct_* tables exist yet (greenfield)
select count(*) as existing_acct_tables
  from information_schema.tables
 where table_schema = 'public' and table_name like 'acct\_%' escape '\';
-- Expected: 0
```

If any check fails, **stop** and reconcile before applying.

### Step 2 — Apply the migration

1. Open Supabase Dashboard → pactdb → SQL Editor → New query.
2. Paste the **entire contents** of
   `supabase/migrations/20260501_acct_phase1_sprint1_1.sql`.
3. Click **Run**.
4. Expected result: a single `COMMIT` success message; no errors.

The migration is wrapped in `BEGIN` / `COMMIT` and is fully idempotent —
re-running is safe.

### Step 3 — Apply the Sudan Chart of Accounts seed

```text
File: docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql
```

Paste and run separately. Adds ~80 postable accounts under the 7 chapter
headers. Idempotent on `code`.

---

## Smoke tests (run after apply, in pactdb SQL editor)

```sql
-- 1. Object counts
select 'funds'    as obj, count(*) from public.acct_funds            union all
select 'accounts',         count(*) from public.acct_accounts         union all
select 'periods',          count(*) from public.acct_fiscal_periods   union all
select 'flags',            count(*) from public.feature_flags;
-- Expected:
--   funds    >= 1     (GENERAL exists)
--   accounts >= 7     (7 chapter headers; ~87 if Sudan COA seed loaded)
--   periods  = 12     (FY2026 monthly)
--   flags    = 6

-- 2. Feature flags reachable
select key, is_enabled from public.feature_flags order by key;

-- 3. Enums installed
select typname from pg_type
 where typname in ('acct_restriction_type','acct_account_type','acct_account_subtype',
                   'acct_period_status','acct_journal_status')
 order by typname;
-- Expected: 5 rows

-- 4. RPC reachable
select proname from pg_proc
 where proname in ('acct_post_journal','acct_trial_balance','feature_enabled')
 order by proname;
-- Expected: 3 rows

-- 5. End-to-end posting smoke (run as a finance/super_admin user via Supabase RPC,
--    NOT in SQL editor — RPC uses auth.uid())
--
--    From the Supabase JS client:
--      supabase.rpc('acct_post_journal', {
--        p_payload: {
--          period_id:      '<uuid of Jan 2026 period>',
--          posting_date:   '2026-01-15',
--          description_en: 'Smoke test entry',
--          description_ar: 'قيد اختبار',
--          source_type:    'manual',
--          lines: [
--            { account_id: '<uuid of an asset account>',   fund_id: '<GENERAL uuid>',
--              function: 'none',     debit_credit: 'DR',
--              original_amount: 100, original_currency: 'SDG',
--              functional_amount: 100, functional_currency: 'SDG' },
--            { account_id: '<uuid of an equity account>',  fund_id: '<GENERAL uuid>',
--              function: 'none',     debit_credit: 'CR',
--              original_amount: 100, original_currency: 'SDG',
--              functional_amount: 100, functional_currency: 'SDG' }
--          ]
--        },
--        p_idempotency_key: 'phase1-smoke-001'
--      })
--    Expected: returns a uuid (the new entry id).
--    Re-running with the same idempotency key returns the SAME uuid (no duplicates).

-- 6. Trial Balance smoke (after step 5)
select * from public.acct_trial_balance(
  (select id from public.acct_fiscal_periods
    where fiscal_year_id = (select id from public.acct_fiscal_years where code='FY2026')
      and period_no = 1)
);
-- Expected: 2 rows (the asset + equity account), debit_total = credit_total = 100.

-- 7. Negative tests (SHOULD all raise)
--    a. Unbalanced entry → BALANCE_MISMATCH
--    b. Same idempotency_key with different payload → returns first uuid (no error)
--    c. Posting to inactive account → ACCOUNT_INACTIVE
--    d. Posting to header account (is_postable=false) → ACCOUNT_NOT_POSTABLE
--    e. Posting to closed period → PERIOD_CLOSED
--    f. Posting as a non-finance role (e.g. data_collector) → AUTHORIZATION_FAILED
--    g. Posting with posting_date outside chosen period range → POSTING_DATE_OUT_OF_PERIOD

-- 8. Concurrency smoke (manual — run from two parallel terminals)
--    Two simultaneous JS clients call acct_post_journal with the SAME
--    idempotency_key and the SAME balanced payload.
--    EXPECTED: both return the same uuid; exactly ONE header row exists for
--    that idempotency_key; exactly N lines exist (no duplicates).
--    Verify with:
--      select count(*) from public.acct_journal_entries
--       where idempotency_key = 'phase1-concurrency-001';   -- expect 1
--      select count(*) from public.acct_journal_lines
--       where entry_id = (select id from public.acct_journal_entries
--                          where idempotency_key='phase1-concurrency-001');
--      -- expect = N (the line count from the payload)
```

If any smoke test fails, capture the exact error message and decide:
- **Logic error** in the migration → patch + re-apply (idempotent).
- **Environment mismatch** → reconcile prerequisite tables and retry.
- **Cannot resolve** → run `PHASE1_SPRINT1_1_ROLLBACK.sql` and report.

---

## Sign-off log

### Code-review sign-off

| Stage | Result | Reviewer | Date | Notes |
|---|---|---|---|---|
| Architect review — round 1 | FAIL (3 must-fix) | architect_1 | 2026-04-25 | Authz hole, idempotency race, missing posting-date guard |
| Patches applied | — | engineering | 2026-04-25 | Role-gate + ON CONFLICT + period-range guard |
| Architect review — round 2 | ✅ **PASS** | architect_1 | 2026-04-25 | "No remaining Sprint 1.1 shipping blocker." Concurrency smoke added per advisory. |
| **Sprint 1.1 sign-off** | ✅ **PASS — cleared to apply to pactdb** | engineering | 2026-04-25 | Migration + seed + rollback + runbook all shipped |

### Apply log (fill in after each environment apply)

| Environment | Applied at | Applied by | Smoke result | Notes |
|---|---|---|---|---|
| pactdb (production) | _yyyy-mm-dd hh:mm UTC_ | _name_ | _pass / fail_ | _link to verification screenshot_ |

---

## What unblocks after Sprint 1.1 ships clean

- **Sprint 1.2** — sanctions screening, SoD matrix, audit-trail visualiser,
  Arabic jsPDF font registration. New migration:
  `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` (next on the queue).
- **Sprint 1.3** — posting-engine unit-test suite + synthetic data generator.
- **Phase 2** — payroll / wallet / cost subs / advances / scanner wired to
  `acct_post_journal`. Each consumer flag-gated.

Refer to `docs/DEPLOYMENT_PHASED_PLAN.md` for the per-phase sign-off gates.
