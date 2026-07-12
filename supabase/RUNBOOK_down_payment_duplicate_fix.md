# Down Payment Duplicate Request — Fix Runbook

## Problem Summary

Multiple active advance requests can exist for the same MMP site in the same month,
and both can be approved independently, resulting in double payment.

## Root Causes (4 independent gaps)

| # | Gap | Where |
|---|-----|--------|
| 1 | **No DB UNIQUE constraint** on `mmp_site_entry_id` — database accepts unlimited duplicate rows for the same site | `down_payment_requests` table schema |
| 2 | **Soft duplicate guard skipped** when `mmpSiteEntryId` is null on older requests | `DownPaymentContext.tsx` `createRequest` |
| 3 | **Role filter hides sibling requests** — DataCollector/Coordinator only load `requested_by = their ID`, so they can't see requests submitted via a different path for the same site | `downPaymentQueries.ts` `applyRoleFilter` |
| 4 | **No approval-level duplicate check** — `supervisorApprove`, `adminApprove`, `bulkApprove` approve by ID only; if 2 pending requests exist for the same site, both get approved independently | `DownPaymentContext.tsx` approval functions |

---

## Step 1 — Run in Supabase SQL Editor (one-time cleanup + prevention)

```sql
-- ============================================================
-- PART A: Audit existing duplicates before fixing
-- ============================================================
-- Shows all sites that currently have more than one active request.
-- Review this output before proceeding.
SELECT
  mmp_site_entry_id,
  site_name,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY created_at) AS request_ids,
  ARRAY_AGG(status ORDER BY created_at) AS statuses,
  ARRAY_AGG(requested_amount ORDER BY created_at) AS amounts,
  ARRAY_AGG(created_at ORDER BY created_at) AS created_dates
FROM down_payment_requests
WHERE mmp_site_entry_id IS NOT NULL
  AND status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY mmp_site_entry_id, site_name
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ============================================================
-- PART B: Resolve existing duplicates (keep newest, cancel older)
-- IMPORTANT: Review PART A output first. Only run after review.
-- ============================================================
WITH ranked AS (
  SELECT
    id,
    mmp_site_entry_id,
    status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY mmp_site_entry_id
      ORDER BY
        -- prefer approved/partially_paid over pending rows
        CASE status
          WHEN 'approved'         THEN 1
          WHEN 'partially_paid'   THEN 1
          WHEN 'fully_paid'       THEN 1
          WHEN 'pending_admin'    THEN 2
          WHEN 'pending_supervisor' THEN 3
          ELSE 4
        END,
        created_at DESC           -- most recent wins within same status tier
    ) AS rn
  FROM down_payment_requests
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted')
)
UPDATE down_payment_requests dp
SET
  status = 'cancelled',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{cancelled_reason}',
    '"Auto-cancelled: duplicate request for the same site — kept newer/higher-status row"'
  ),
  updated_at = NOW()
FROM ranked r
WHERE dp.id = r.id
  AND r.rn > 1;       -- cancel all but the winner (rn=1)

-- Confirm: should return 0 rows after cleanup
SELECT COUNT(*) AS remaining_duplicates
FROM down_payment_requests
WHERE mmp_site_entry_id IS NOT NULL
  AND status NOT IN ('cancelled', 'rejected', 'deleted')
GROUP BY mmp_site_entry_id
HAVING COUNT(*) > 1;

-- ============================================================
-- PART C: Add UNIQUE partial index to prevent future duplicates
-- Only runs after Part B produces 0 remaining duplicates.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS down_payment_requests_active_site_unique
  ON down_payment_requests (mmp_site_entry_id)
  WHERE mmp_site_entry_id IS NOT NULL
    AND status NOT IN ('cancelled', 'rejected', 'deleted');
```

---

## Step 2 — App-level fixes (already applied in code)

The following were fixed in the React app simultaneously:

- **`createRequest`**: Guard now also checks `(site_name, hub_id)` as a fallback when `mmpSiteEntryId` is null.
- **`supervisorApprove` / `adminApprove`**: Both now check for existing approved/pending_admin sibling requests for the same site entry before proceeding, and warn the approver.
- **Approval panel UI**: Sibling requests (same `mmpSiteEntryId`) now show a red ⚠ DUPLICATE ACTIVE REQUEST banner on the card with a one-click Cancel Duplicate button.

---

## After applying the DB migration

1. Run Part A — review the list of duplicates.
2. Run Part B — cancel the older/lower-status duplicates.
3. Confirm Part B confirmation query returns 0.
4. Run Part C — add the index.

The UNIQUE index will then guarantee the database itself rejects any future duplicate inserts, even in race-condition scenarios.
