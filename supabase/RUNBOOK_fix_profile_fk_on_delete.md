# Runbook: Fix FK Constraints on profiles(id) — ON DELETE SET NULL

## Problem

Deleting a user from **User Management** throws:

```
update or delete on table "profiles" violates foreign key constraint
"notifications_triggered_by_fkey" on table "notifications"
```

Several tables reference `profiles(id)` via authorship/audit columns
(`triggered_by`, `created_by`, `assigned_by`, `uploaded_by`) without any
`ON DELETE` rule.  Postgres defaults to `NO ACTION`, which blocks the parent
row delete entirely.

The app-level pre-cleanup (deleting notifications first) is silently blocked by
RLS, so the profile delete always hits the raw FK and fails.

## Fix

Migration file: `supabase/migrations/20260718_fix_profile_fk_on_delete.sql`

### Tables fixed

| Table | Column | Old rule | New rule |
|---|---|---|---|
| `notifications` | `triggered_by` | NO ACTION | ON DELETE SET NULL |
| `hr_policies` | `created_by` | NO ACTION | ON DELETE SET NULL |
| `hr_assets` | `created_by` | NO ACTION | ON DELETE SET NULL |
| `hr_asset_assignments` | `assigned_by` | NO ACTION | ON DELETE SET NULL |
| `hr_employee_documents` | `uploaded_by` | NO ACTION | ON DELETE SET NULL |

**Why SET NULL instead of CASCADE?**  These columns record *who authored* an
audit record or notification.  The record itself (the notification, the asset,
the policy) must be preserved for accountability.  Nulling the author column
keeps the history intact while allowing the profile row to be deleted.

Columns that use `ON DELETE CASCADE` correctly (e.g. `hr_employee_personal.profile_id`,
`hr_policy_acknowledgements.user_id`) are **not changed** — those child rows
are meaningless without the profile and should be removed together.

## How to Apply

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the full contents of
   `supabase/migrations/20260718_fix_profile_fk_on_delete.sql`.
3. Click **Run**.
4. Verify by running the discovery query at the bottom of the migration file —
   it should return **zero rows** for the tables listed above.

The migration is safe to re-run (`DROP CONSTRAINT IF EXISTS` guards every drop).

## Verification

After applying, go to **User Management** in the app and delete a test user
(one who has triggered notifications).  The delete should succeed without a
constraint error.  Notifications previously triggered by that user will remain
in the `notifications` table with `triggered_by = NULL`.

## App-Level Belt-and-Suspenders (Users.tsx)

In addition to the DB migration, the app-level pre-cleanup was changed from:

```ts
// OLD — tried to delete notification rows (blocked by RLS silently)
await supabase.from('notifications').delete().eq('triggered_by', userId);
```

to:

```ts
// NEW — nulls the column instead (less restricted, preserves history)
await supabase.from('notifications')
  .update({ triggered_by: null })
  .eq('triggered_by', userId);
```

This acts as a belt-and-suspenders guard even on databases where the migration
has not yet been applied.

## Related Files

- `supabase/migrations/20260718_fix_profile_fk_on_delete.sql` — the migration
- `src/pages/Users.tsx` — app-level pre-cleanup fix
- `supabase/migrations/20250715_hr_policies.sql` — original `hr_policies` table
- `supabase/migrations/20250715_hr_assets.sql` — original `hr_assets` table
- `supabase/migrations/20250715_employee_profile_complete_setup.sql` — original `hr_employee_documents`
