# Runbook: Apply `uq_dp_requests_active_entry` Unique Index

**Status:** Waiting on finance to resolve paid duplicates (34 sites flagged)  
**Migration file:** `supabase/migrations/down_payment_uniqueness_complete_fix.sql`

---

## Background

The trigger (`trg_dp_request_uniqueness`) and the name+hub index (`uq_dp_requests_active_name_hub`) are already live in production. The final piece is a partial unique index on `mmp_site_entry_id`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_entry
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');
```

This index **cannot be created** while any two active (non-cancelled/rejected/deleted) rows share the same `mmp_site_entry_id`. When STEP 1 ran, it deliberately skipped `fully_paid` and `partially_paid` rows — those require human review.

---

## Steps for Finance Team

### Step 1 — See which sites still have duplicates

Run this in the **Supabase SQL Editor**:

```sql
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )                  AS site_key,
  site_name,
  COUNT(*)           AS still_duplicate,
  ARRAY_AGG(id            ORDER BY created_at) AS request_ids,
  ARRAY_AGG(status        ORDER BY created_at) AS statuses,
  ARRAY_AGG(requested_amount ORDER BY created_at) AS amounts_sdg,
  ARRAY_AGG(created_at::date ORDER BY created_at) AS created_dates
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY still_duplicate DESC;
```

If this returns **0 rows**, skip to Step 3.

---

### Step 2 — Cancel the extra rows (one row must survive per site)

For each duplicate group, decide which row is the "real" advance and cancel the rest. The safest pattern is to keep the **most recent fully_paid row** and cancel older duplicates.

Use this template — replace `<ID_TO_CANCEL>` with the actual UUID(s):

```sql
UPDATE down_payment_requests
SET
  status     = 'cancelled',
  updated_at = NOW(),
  metadata   = jsonb_set(
    COALESCE(metadata, '{}'),
    '{auto_cancelled_reason}',
    '"Manually cancelled by finance: duplicate paid advance for same site — resolved as part of unique-index migration."',
    true
  )
WHERE id = '<ID_TO_CANCEL>';
```

> **Rule:** Never cancel the row that actually represents the real payment. When both rows are `fully_paid`, keep the one with the larger or most recent amount and cancel the other.

---

### Step 3 — Re-run STEP 2 verification (must return 0 rows)

```sql
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )                  AS site_key,
  site_name,
  COUNT(*)           AS still_duplicate
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

**Do not proceed until this returns 0 rows.**

---

### Step 4 — Apply the unique index (STEP 3 of migration)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_entry
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');
```

---

### Step 5 — Confirm everything is in place

```sql
-- Should return both indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'down_payment_requests'
  AND indexname IN ('uq_dp_requests_active_entry', 'uq_dp_requests_active_name_hub');

-- Should return the trigger
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'down_payment_requests'
  AND trigger_name = 'trg_dp_request_uniqueness';
```

Expected output: **2 rows** for the index query and **2 rows** (INSERT + UPDATE) for the trigger query.

---

## Done Checklist

- [ ] Step 3 (STEP 2 verification) returns **0 rows**
- [ ] `uq_dp_requests_active_entry` index created successfully
- [ ] Final verification confirms both indexes and the trigger are present

---

## All SQL in one place

Full migration script (all steps): `supabase/migrations/down_payment_uniqueness_complete_fix.sql`
