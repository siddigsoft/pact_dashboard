# Phase 8 — Audit-Pack Export + External Auditor Portal: Manual Apply Runbook

**File:** `supabase/migrations/accounting_phase8_audit_pack.sql`
**Database:** `abznugnirnlrqnnfkein` (pactdb)
**Prerequisite:** Phase 1 applied (needs `acct_fiscal_years`, `acct_fiscal_periods`, `acct_journal_entries`, `acct_journal_lines`, `acct_accounts`, `feature_flags`, `acct_gl_bridge_log`)
**Independent of:** Phases 4–7

---

## What this migration creates

| Object | Type | Notes |
|---|---|---|
| `acct_audit_packs` | Table | Pack header — fiscal year scope, status, access token, item/finding counters |
| `acct_audit_pack_items` | Table | JSONB snapshots: trial balance, journal summary, COA, periods, bank recon, grants |
| `acct_auditor_findings` | Table | Findings/queries raised by external auditors — priority, status, response workflow |
| `acct_generate_audit_pack(fy_id)` | RPC | Creates pack + snapshots up to 6 item types from live GL data; returns pack UUID |
| `acct_audit_pack_summary(pack_id)` | RPC | Pack header + item types present + finding counts |
| `acct_trig_audit_pack_finalized()` | Trigger fn | GL bridge when pack → finalized / shared |
| `acct_trig_finding_counter()` | Trigger fn | Keeps finding_count + open_finding_count in sync on INSERT/UPDATE/DELETE |
| `acct_bridge_audit_pack_finalized` | Trigger | AFTER UPDATE on `acct_audit_packs` |
| `acct_finding_counter_ins/upd/del` | Triggers (×3) | AFTER INSERT/UPDATE/DELETE on `acct_auditor_findings` |
| `v_acct_phase8_coverage` | View | Bridge health: success/error/skipped counts |
| 3 feature flags | Rows | See below |

---

## Feature flags inserted

| Key | Default | Purpose |
|---|---|---|
| `acct.audit_pack.enabled` | **true** | Enable pack generation + portal |
| `acct.auditor_portal.enabled` | **false** | Enable external auditor token-based access |
| `acct.bridge.audit_pack` | **true** | GL bridge on pack finalized/shared |

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_phase8_audit_pack.sql`
4. Click **Run**

### Expected NOTICE

```
NOTICE:  acct_bridge_audit_pack_finalized created on acct_audit_packs.
NOTICE:  acct_finding_counter triggers created on acct_auditor_findings.
```

### Expected final result rows

```
audit_pack_tables_ok = 3
phase8_flags         = 3
(4 trigger rows)
Phase 8 audit pack SQL complete.
```

---

## Smoke tests

```sql
-- 1. Tables exist
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('acct_audit_packs','acct_audit_pack_items','acct_auditor_findings')
order by table_name;
-- expect 3 rows

-- 2. Feature flags
select key, is_enabled from feature_flags
where key like 'acct.audit%' or key like 'acct.bridge.audit%';
-- expect 3 rows

-- 3. Generate a pack (requires at least one fiscal year in pactdb)
select acct_generate_audit_pack(
  (select id from acct_fiscal_years order by start_date desc limit 1)
);
-- expect: returns a UUID

-- 4. View the generated pack
select id, title, status, item_count, generated_at
from acct_audit_packs order by created_at desc limit 1;
-- expect 1 row with status='generated' and item_count > 0

-- 5. View pack items
select item_type, item_label, row_count
from acct_audit_pack_items
where pack_id = (select id from acct_audit_packs order by created_at desc limit 1);
-- expect 4–6 rows depending on which optional tables exist

-- 6. Pack summary RPC
select * from acct_audit_pack_summary(
  (select id from acct_audit_packs order by created_at desc limit 1)
);
-- expect 1 row

-- 7. GL bridge — move pack to finalized
update acct_audit_packs
set status = 'finalized', finalized_at = now()
where id = (select id from acct_audit_packs order by created_at desc limit 1);

select source_table, event_type, status, je_description, created_at
from acct_gl_bridge_log
where source_table = 'acct_audit_packs'
order by created_at desc limit 3;
-- expect 1 row: event_type = audit_pack_finalized
```

---

## Rollback

See `docs/sql/PHASE8_AUDIT_PACK_ROLLBACK.sql`

---

## Phase 9 preview

Phase 9 — Donor-side reporting + budget-vs-actual variance.
