---
name: MMP site entry deletion guards
description: Three guards that prevent mmp_site_entries from being wiped when linked down-payment submissions exist — root cause was "Edit MMP" wipe incident on July 2026 MMP.
---

# MMP Site Entry Deletion Guards

## The incident
"Edit MMP" save function in `MMPContext.tsx` computes `deleteIds = existingIds - updatedIds` and hard-deletes them. When an admin edited July 2026 MMP without a full site list in the form payload, all 941 site entries were deleted — leaving 593 down_payment_requests orphaned (mmpName = null, invisible in filters).

**Why:** `down_payment_requests.mmpName` resolves via `mmp_site_entry_id → mmp_site_entries → mmp_files.name`, NOT via a direct `mmp_id` column. So deleted site entries = invisible submissions.

## Three guards added

### 1. Edit MMP save — `src/context/mmp/MMPContext.tsx`
Before executing `deleteIds` batch delete, queries `down_payment_requests` for any matching `mmp_site_entry_id`. If found → returns false (blocks save silently, logs error).

### 2. Hard delete MMP — `src/context/mmp/hooks/useMMPOperations.ts`
At the very start of `deleteMMPFile`, checks:
- site entries → down_payment_requests (via mmp_site_entry_id)
- operational_cost_submissions.mmp_id directly
If either has rows → toast error, return false. Guards even if guard check itself fails (fail-safe).

### 3. Partial update — `src/components/mmp/MMPPartialUpdate.tsx`
Before "delete by state/hub" loop, checks each state's entries for linked requests. Throws visible error if any linked.

## Archive-first UI — `src/components/mmp/MMPList.tsx`
Stage 1 delete dialog redesigned: Archive (green/recommended) + Delete permanently (red). Archive calls `archiveMMP(id, userId)` which sets status='archived', archivedby, archivedat. Hard delete still available but auto-blocked by guard above.

**Why:** `archiveMMP` already existed in `useMMPStatusOperations.ts` — it's a status update, not a cascade delete.

## Recovery SQL for this type of incident
```sql
INSERT INTO public.mmp_site_entries (id, mmp_file_id, site_name, hub_office, status, created_at, updated_at)
SELECT DISTINCT ON (dpr.mmp_site_entry_id)
  dpr.mmp_site_entry_id,
  '<mmp_uuid>',
  dpr.site_name, dpr.hub_name, 'forwarded_to_coordinator',
  MIN(dpr.created_at) OVER (PARTITION BY dpr.mmp_site_entry_id), NOW()
FROM public.down_payment_requests dpr
WHERE dpr.mmp_site_entry_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.mmp_site_entries mse WHERE mse.id = dpr.mmp_site_entry_id)
  AND dpr.created_at BETWEEN '<month_start>' AND '<month_end>'
ON CONFLICT (id) DO NOTHING;
```
Recovery preserves site_name and hub_name but loses state, locality, site_code, cp_name.

## Supabase PITR
Enable in Supabase Dashboard → Settings → Database → Point in Time Recovery (Pro plan). Would allow instant restore to any timestamp without SQL reconstruction.
