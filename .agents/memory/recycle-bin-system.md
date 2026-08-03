---
name: Recycle Bin System
description: Global soft-delete / recycle bin implemented across the app — deleted records go here for 28 days before permanent purge.
---

# Recycle Bin System

## What was built
- `supabase/migrations/20260803l_recycle_bin.sql` — creates `recycle_bin` table with RLS (Super Admin only). Includes commented-out pg_cron auto-purge (enable pg_cron in Supabase Extensions first).
- `src/utils/softDelete.ts` — `softDelete()` saves a JSON snapshot to recycle_bin before any hard delete; `restoreFromBin()` re-inserts the snapshot and marks restored_at.
- `src/pages/RecycleBin.tsx` — Super Admin-only UI at `/recycle-bin`. Shows all soft-deleted records, stats, restore/purge buttons, table filter, search.
- Route: `/recycle-bin` wrapped in `SuperAdminRoute` in `src/App.tsx`.
- Sidebar: "Recycle Bin" link added to Super Admin section in `src/components/AppSidebar.tsx` (uses Archive icon, already imported).

## Delete guards added (Super Admin only)
- `src/pages/Positions.tsx` — `handleDelete` now requires `isSA`, saves snapshot to recycle_bin first.
- `src/pages/PreFundingRegistry.tsx` — `handleDelete` and `handleDeleteFundTxn` now require `isSuper` (was `canManage`), save to recycle_bin first via dynamic import.
- `src/pages/UserDetail.tsx` — `handleContractDelete` and `handleDeleteReview` now require `isSA`, save to recycle_bin first.

## Pattern for adding to new pages
```typescript
import { softDelete } from '@/utils/softDelete';
// Before every .delete():
const { data: snap } = await supabase.from('table').select('*').eq('id', id).single();
if (snap) await softDelete(supabase, 'table', id, snap, userId, userName);
await supabase.from('table').delete().eq('id', id);
```

## Supabase PITR
Enable via Dashboard → Settings → Add-ons → Point in Time Recovery (Pro plan). Complementary to recycle bin for catastrophic recovery.

## Auto-purge
pg_cron job is in the migration file (commented out). Enable pg_cron under Database → Extensions, then uncomment and run the cron.schedule() call.

## Tables NOT yet covered by softDelete
All hooks: useStageData, useFieldTaskAttachments, useFieldTaskComments, usePersonalTasks, useTaskActivity, ProjectRisksPanel, MobileCostSubmission. These need the same pattern applied.
