# Down Payment Duplicate Prevention — Complete Fix

## What was wrong

Multiple advance requests could be created for the same site in the same MMP, and both could be approved independently, causing **double payment**. There were 4 independent gaps:

| # | Gap | Where |
|---|-----|--------|
| 1 | No database UNIQUE constraint — DB accepted unlimited duplicates | DB schema |
| 2 | App soft-guard skipped when `mmp_site_entry_id` is NULL (old rows) | `createRequest` |
| 3 | `bulkApprove` had no sibling check — bulk action could approve both | `bulkApprove` |
| 4 | No DB trigger — direct SQL inserts bypassed all app guards | DB schema |

---

## What is already fixed in the app code

All app-level guards are applied. No code changes needed from you.

| Function | Guard |
|---|---|
| `createRequest` | Blocks new request if active sibling exists (Path A by entry id, Path B by site_name+hub_id) |
| `supervisorApprove` | Checks DB for approved/pending_admin sibling before approving |
| `adminApprove` | Same check at admin tier |
| `bulkApprove` | Skips any request whose site entry already has an approved/paid sibling |
| UI banner | Shows **red** "DOUBLE PAYMENT RISK" card when sibling is approved; amber when sibling is still pending |

---

## SQL to run in Supabase — copy the file below

**File:** `supabase/migrations/down_payment_uniqueness_complete_fix.sql`

Run the steps **in order** in Supabase → SQL Editor.

---

### STEP 0 — Audit (read-only, run first)

Shows every site that currently has more than one active request.
Review this list carefully before touching anything.

```sql
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    'NO-ENTRY:' || LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )                                                             AS site_key,
  site_name,
  hub_name,
  COUNT(*)                                                      AS duplicate_count,
  ARRAY_AGG(id            ORDER BY created_at)                  AS request_ids,
  ARRAY_AGG(status        ORDER BY created_at)                  AS statuses,
  ARRAY_AGG(requested_amount ORDER BY created_at)               AS amounts_sdg,
  ARRAY_AGG(created_at::date ORDER BY created_at)               AS created_dates
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

---

### STEP 1 — Cancel duplicates (keep the best row per site)

Priority: `fully_paid` > `partially_paid` > `approved` > `pending_admin` > `pending_supervisor`.
Most recent row wins within the same tier.
**Rows that are `partially_paid` or `fully_paid` are never auto-cancelled** — those need human review.

```sql
WITH ranked AS (
  SELECT
    id, status,
    ROW_NUMBER() OVER (
      PARTITION BY mmp_site_entry_id
      ORDER BY
        CASE status
          WHEN 'fully_paid'         THEN 1
          WHEN 'partially_paid'     THEN 2
          WHEN 'approved'           THEN 3
          WHEN 'pending_admin'      THEN 4
          WHEN 'pending_supervisor' THEN 5
          ELSE 6
        END,
        created_at DESC
    ) AS rn
  FROM down_payment_requests
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted')

  UNION ALL

  SELECT
    id, status,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(COALESCE(site_name,''))), hub_id
      ORDER BY
        CASE status
          WHEN 'fully_paid'         THEN 1
          WHEN 'partially_paid'     THEN 2
          WHEN 'approved'           THEN 3
          WHEN 'pending_admin'      THEN 4
          WHEN 'pending_supervisor' THEN 5
          ELSE 6
        END,
        created_at DESC
    ) AS rn
  FROM down_payment_requests
  WHERE mmp_site_entry_id IS NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted')
)
UPDATE down_payment_requests dp
SET
  status     = 'cancelled',
  updated_at = NOW(),
  metadata   = jsonb_set(
    COALESCE(metadata, '{}'),
    '{auto_cancelled_reason}',
    '"Auto-cancelled: duplicate advance request for the same site — the best-status/most-recent row was kept."',
    true
  )
FROM ranked r
WHERE dp.id = r.id
  AND r.rn > 1
  AND dp.status NOT IN ('partially_paid', 'fully_paid');
```

---

### STEP 2 — Verify 0 duplicates remain

**This must return 0 rows before you run Steps 3–5.**
If it returns rows, those are paid duplicates — contact finance to resolve manually first.

```sql
SELECT
  COALESCE(
    mmp_site_entry_id::text,
    LOWER(TRIM(COALESCE(site_name,''))) || '::' || COALESCE(hub_id::text, 'no-hub')
  )       AS site_key,
  site_name,
  COUNT(*) AS still_duplicate
FROM down_payment_requests
WHERE status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY 1, 2
HAVING COUNT(*) > 1;
```

---

### STEP 3 — UNIQUE index for rows with `mmp_site_entry_id`

Prevents the DB from storing a second active request for the same MMP site entry.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_entry
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');
```

---

### STEP 4 — UNIQUE index for legacy rows (no `mmp_site_entry_id`)

Same protection for older records that have no entry id, keyed by site name + hub.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_requests_active_name_hub
  ON down_payment_requests (LOWER(TRIM(COALESCE(site_name,''))), hub_id)
  WHERE mmp_site_entry_id IS NULL
    AND hub_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');
```

---

### STEP 5 — DB trigger (strongest guard)

Fires on every INSERT and every status UPDATE. Blocks duplicates even if the app code is bypassed (e.g. direct SQL, edge function, etc.).

```sql
CREATE OR REPLACE FUNCTION enforce_dp_request_uniqueness()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Rows moving to terminal states are always OK
  IF NEW.status IN ('cancelled', 'rejected', 'deleted') THEN
    RETURN NEW;
  END IF;

  -- Path A: precise check by mmp_site_entry_id
  IF NEW.mmp_site_entry_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM down_payment_requests
      WHERE mmp_site_entry_id = NEW.mmp_site_entry_id
        AND id <> NEW.id
        AND status NOT IN ('cancelled', 'rejected', 'deleted')
    ) THEN
      RAISE EXCEPTION
        'DUPLICATE_DP_REQUEST: An active advance request already exists for MMP site entry %. Cancel or resolve it first.',
        NEW.mmp_site_entry_id
        USING ERRCODE = 'unique_violation';
    END IF;

  -- Path B: fallback for legacy rows without entry id
  ELSIF NEW.site_name IS NOT NULL AND NEW.hub_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM down_payment_requests
      WHERE LOWER(TRIM(COALESCE(site_name,''))) = LOWER(TRIM(NEW.site_name))
        AND hub_id = NEW.hub_id
        AND mmp_site_entry_id IS NULL
        AND id <> NEW.id
        AND status NOT IN ('cancelled', 'rejected', 'deleted')
    ) THEN
      RAISE EXCEPTION
        'DUPLICATE_DP_REQUEST: An active advance request already exists for site "%" in hub %. Cancel or resolve it first.',
        NEW.site_name, NEW.hub_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_request_uniqueness ON down_payment_requests;

CREATE TRIGGER trg_dp_request_uniqueness
  BEFORE INSERT OR UPDATE OF status
  ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION enforce_dp_request_uniqueness();
```

---

### STEP 6 — Final verification

```sql
-- Should return 2 rows (the two indexes)
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'down_payment_requests'
  AND indexname IN ('uq_dp_requests_active_entry', 'uq_dp_requests_active_name_hub');

-- Should return 1 row (the trigger)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'down_payment_requests'
  AND trigger_name = 'trg_dp_request_uniqueness';
```

---

## Summary of all protection layers after fix

```
New request submitted
        │
        ▼
  App guard (createRequest)
  ├─ Path A: checks mmp_site_entry_id ──▶ BLOCKS if active sibling exists
  └─ Path B: checks site_name + hub_id ─▶ BLOCKS if active sibling exists (legacy)
        │
        ▼
  DB UNIQUE index — rejects INSERT if constraint violated
        │
        ▼
  DB trigger — raises exception for any bypass attempt

Approval attempted
        │
        ▼
  App guard (supervisorApprove / adminApprove / bulkApprove)
  └─ Queries DB for approved/pending_admin sibling ──▶ BLOCKS if found
        │
        ▼
  DB trigger fires again on UPDATE OF status — final backstop
```

Every path is now covered. A site entry can only ever have **one** active advance request at a time.
