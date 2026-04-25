# PACT Accounting — Phase 1 Sprint 1.2 · Manual Apply Runbook

**Migration:** `supabase/migrations/20260508_acct_phase1_sprint1_2.sql`
**Target DB:** `pactdb` (project ref `abznugnirnlrqnnfkein`) — **production**
**Apply method:** **MANUAL only** — paste into Supabase SQL Editor
**Depends on:** Sprint 1.1 (`20260501_acct_phase1_sprint1_1.sql`) **applied + smoke-clean for ≥ 24 h**
**Estimated duration:** 5 min apply · 15 min smoke test · 20 min total
**Reversibility:** Full rollback — `docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql`

> ⚠️ **NEVER** apply this from Replit, npm scripts, or `db:push`. Every accounting
> migration is hand-pasted into the pactdb SQL editor. Do not bypass.

---

## What Sprint 1.2 delivers

| Object | Purpose |
|---|---|
| 2 enums (`acct_sanctions_list`, `acct_aml_status`) | Strong typing for sanctions + AML alerts |
| `acct_sanctioned_parties` | Sanctions list (OFAC / EU / UN / HMT / DFAT) |
| `acct_aml_alerts` | Per-partner AML alerts (open / false_positive / blocked / escalated) |
| `acct_normalize_name()` | Helper used for fuzzy matching |
| `acct_screen_party(partner_id)` RPC | Returns whether a partner matches the sanctions list |
| `acct_sod_rules` | The four canonical Segregation-of-Duties rules (SOD-1..4) — **seeded** |
| `acct_sod_violations` | Append-only log of blocked attempts |
| `acct_check_sod(user, action, ctx)` RPC | Returns whether an action is allowed under SoD |
| `acct_finance_audit_log` | Generic before/after change log |
| `acct_log_finance_change()` trigger | Captures every INSERT/UPDATE/DELETE on the four sensitive config tables |
| Triggers on `acct_funds`, `acct_accounts`, `acct_fiscal_periods`, `feature_flags` | Wired to the audit function |
| **PATCH** to `acct_post_journal` | Replaces Sprint 1.1 placeholder sanctions/SoD blocks with real calls |

Phase 1 acceptance criteria satisfied by this sprint:

- **#3 — Sanctions block ✅** (full enforcement in `acct_post_journal`).
- **#4 — SoD matrix foundation ✅ (PARTIAL by design):**
  - Rules table + 4 seed rules (SOD-1..4) ✅
  - Append-only violations log ✅
  - `acct_check_sod` RPC ✅ (correctly enforces same_entry+journal.* when a real journal entry id is passed in)
  - **Posting-path enforcement is intentionally deferred to Phase 2.** Sprint 1.1 has no draft → approve workflow, so calling SoD from `acct_post_journal` had no creator-vs-approver pair to compare. The Phase 2 journal draft/approve UI will pass the real `entry_id` to `acct_check_sod`. The flag `acct.sod.enforce` is a no-op for posting until then; it remains effective for any caller that invokes the RPC directly.
- **#10 — Audit-trail data layer ✅** (table + triggers; visualiser page ships in the Phase 1 frontend sprint).

Still deferred to the **Phase 1 frontend sprint**: criterion #9 (Arabic jsPDF font) and the audit-trail visualiser page itself. 2FA enforcement is configured in Supabase Auth, not SQL. Posting-path SoD ships in **Phase 2**.

---

## Prerequisites

1. ✅ Sprint 1.1 applied to pactdb and smoke-clean for ≥ 24 h.
2. ✅ Apply log row recorded in `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md`.
3. You have access to **pactdb** SQL Editor as a service-role user.
4. You have read `PHASE1_SPRINT1_2_ROLLBACK.sql` (knows how to undo).

---

## Apply procedure

### Step 1 — Pre-flight checks (run first)

```sql
-- Confirm we're on pactdb
select current_database();

-- Confirm Sprint 1.1 is in place (the migration also self-checks this)
select to_regclass('public.acct_journal_entries') is not null as je_ok,
       to_regclass('public.acct_funds')           is not null as funds_ok,
       to_regclass('public.feature_flags')        is not null as flags_ok;
-- Expected: all true

-- Confirm Sprint 1.2 hasn't been applied yet
select count(*) as already_applied
  from information_schema.tables
 where table_schema='public' and table_name='acct_sanctioned_parties';
-- Expected: 0 (if 1, Sprint 1.2 is already applied — re-run is safe but unneeded)
```

### Step 2 — Apply the migration

1. Open Supabase Dashboard → pactdb → SQL Editor → New query.
2. Paste **the entire contents** of `supabase/migrations/20260508_acct_phase1_sprint1_2.sql`.
3. Click **Run**.
4. Expected: single `COMMIT` success; no errors. Migration is wrapped in
   `BEGIN`/`COMMIT` and is fully idempotent.

### Step 3 — Load a smoke sanctions test row

```sql
-- Insert one test entry that matches a known partner name in your DB so the
-- sanctions block can be exercised end-to-end. Replace the value as needed.
insert into public.acct_sanctioned_parties
  (list, external_id, full_name, aliases, country, match_hash, raw)
values
  ('OFAC_SDN', 'TEST-001', 'Test Sanctioned Entity',
   array['test sanctioned ltd','tse co'],
   'XX',
   public.acct_normalize_name('Test Sanctioned Entity'),
   '{"source":"smoke-test"}'::jsonb)
on conflict (list, external_id) do nothing;
```

---

## Smoke tests

```sql
-- 1. Object counts
select 'sanctioned' as obj, count(*) from public.acct_sanctioned_parties  union all
select 'aml_alerts',         count(*) from public.acct_aml_alerts          union all
select 'sod_rules',          count(*) from public.acct_sod_rules           union all
select 'sod_violations',     count(*) from public.acct_sod_violations      union all
select 'audit_log',          count(*) from public.acct_finance_audit_log;
-- Expected:
--   sanctioned     >= 1   (test row exists)
--   aml_alerts     >= 0
--   sod_rules      = 4    (SOD-1..SOD-4 seeded)
--   sod_violations >= 0
--   audit_log      >= 0

-- 2. SoD seed rules
select code, scope, forbidden_pair from public.acct_sod_rules order by code;
-- Expected: SOD-1, SOD-2, SOD-3, SOD-4 with correct forbidden_pair arrays.

-- 3. RPCs reachable
select proname from pg_proc
 where proname in ('acct_screen_party','acct_check_sod','acct_normalize_name')
 order by proname;
-- Expected: 3 rows.

-- 4. Audit trigger smoke — flip a feature flag and confirm the log catches it
update public.feature_flags
   set is_enabled = false
 where key = 'acct.parallel_run.enabled';
update public.feature_flags
   set is_enabled = false
 where key = 'acct.parallel_run.enabled';   -- second update is a no-op for the column

select table_name, op, changed_keys, new_row->>'key' as flag_key, changed_at
  from public.acct_finance_audit_log
 where table_name = 'feature_flags'
 order by changed_at desc limit 5;
-- Expected: at least one UPDATE row with changed_keys containing 'is_enabled'
--           (or 'updated_at') and flag_key='acct.parallel_run.enabled'.

-- 5. Sanctions screening RPC smoke
--    a. Find a partner that EXACTLY matches your seed row. Replace 'name'
--       with whichever name column your partners table uses (the RPC itself
--       discovers it automatically; this query is just to find a uuid).
-- select id, name from public.partners
--  where lower(name) = lower('Test Sanctioned Entity') limit 1;
--    b. Call the RPC and expect matched=true. ALSO confirm an aml_alerts row
--       was inserted (Sprint 1.2 design: fresh matches persist as 'open').
-- select * from public.acct_screen_party('<that partner uuid>');
-- select count(*) from public.acct_aml_alerts
--  where partner_id = '<that partner uuid>' and status = 'open';
-- Expected RPC: matched=true, alert_id=<new uuid>, matched_party_id=<seed>, score=100
-- Expected count: 1 (alert was persisted)
--
--    c. Latest-decision-wins smoke: mark the alert as false_positive and
--       re-run the RPC; expect matched=false (last reviewer's call stands).
-- update public.acct_aml_alerts set status='false_positive', resolved_at=now()
--   where partner_id = '<that partner uuid>';
-- select * from public.acct_screen_party('<that partner uuid>');
-- Expected: matched=false (latest decision wins).

-- 6. End-to-end SANCTIONS_BLOCK smoke (run via Supabase JS client as a finance user):
--    First clear any false_positive on the test partner (or use a fresh partner).
--    supabase.rpc('acct_post_journal', {
--      p_payload: { ...balanced 2-line entry that names the sanctioned partner_id... },
--      p_idempotency_key: 'phase1-sprint1_2-sanctions-001'
--    })
-- Expected: function raises 'SANCTIONS_BLOCK: partner ... matches sanctions list ...'

-- 7. acct_check_sod direct RPC smoke (SoD is intentionally NOT wired into
--    acct_post_journal in Sprint 1.2; it's a standalone RPC for Phase 2
--    consumers that have a real journal entry id to compare against).
-- select public.acct_check_sod(
--   auth.uid(),
--   'journal.approve',
--   jsonb_build_object('entry_id', '<a journal entry created_by you>')
-- );
-- Expected: false (caller created the entry → cannot also approve it).
-- And: a row was logged in acct_sod_violations.
-- select count(*) from public.acct_sod_violations where user_id = auth.uid();

-- 8. Feature flag toggles
--    a. set 'acct.sanctions.block_on_match' = false → posts that reference a
--       sanctioned partner now succeed. Re-enable after the test.
--    b. SoD toggle has no functional effect on posting in Sprint 1.2 by design;
--       see the comment block in acct_post_journal step 7.
```

If any smoke test fails, capture the error and either patch + re-apply (idempotent) or roll back via `PHASE1_SPRINT1_2_ROLLBACK.sql`.

---

## Sign-off log

### Code-review sign-off

| Stage | Result | Reviewer | Date | Notes |
|---|---|---|---|---|
| Architect review — round 1 | FAIL (4 must-fix) | architect_1 | 2026-04-25 | Sanctions schema fragility + false-positive ordering + missing alert insert; SoD wired to wrong context (source_id ≠ entry_id); audit changed_keys INTERSECT misses added/removed keys; rollback not faithful Sprint 1.1 restore |
| Patches applied | — | engineering | 2026-04-25 | Schema-safe column discovery via information_schema + format(%I); latest-decision-wins; insert-on-fresh-match; SoD removed from posting (RPC stays available, deferred to Phase 2 with explicit doc); UNION for audit diff; rollback now verbatim Sprint 1.1 body |
| Architect review — round 2 | ✅ **PASS** | architect_1 | 2026-04-25 | "Round-1 functional blockers resolved; no new technical blockers for pactdb apply." Doc caveat addressed in this revision. |
| **Sprint 1.2 sign-off** | ✅ **PASS — cleared to apply to pactdb** | engineering | 2026-04-25 | Sprint 1.2 ships sanctions enforcement + audit data layer + SoD RPC foundation. Posting-path SoD enforcement is explicitly Phase 2. |

### Apply log

| Environment | Applied at | Applied by | Smoke result | Notes |
|---|---|---|---|---|
| pactdb (production) | _yyyy-mm-dd hh:mm UTC_ | _name_ | _pass / fail_ | _link to verification screenshot_ |

---

## What unblocks after Sprint 1.2 ships clean

- **Sprint 1.3** — posting-engine unit-test suite + synthetic data generator.
  Migration: `supabase/migrations/20260515_acct_phase1_sprint1_3.sql`.
- **Phase 1 frontend sprint** — `/accounting/coa`, `/accounting/journals`,
  `/accounting/trial-balance`, `/finance/audit-trail` + Arabic jsPDF font.
- **Phase 2** — wire payroll / wallets / cost subs / advances / scanner to
  `acct_post_journal` (each consumer flag-gated).
