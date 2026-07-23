# Runbook: Fix Avatar Storage RLS + Restore Missing Photos

## What was broken

| # | Problem | Impact |
|---|---------|--------|
| 1 | INSERT policy pattern `avatars/<uuid>.%` didn't match Settings.tsx filename `<uuid>-<timestamp>.ext` | Self-service avatar uploads from Settings page silently failed for ALL users |
| 2 | UPDATE policy used `split_part(name,'/',2)` returning `uuid.jpg` (with extension), never matching `auth.uid()` | Re-uploading / upsert on existing files blocked for everyone |
| 3 | Admin INSERT policy checked `role IN ('Admin','SuperAdmin')` — case-sensitive mismatch for `admin`/`super_admin` in DB | Admins couldn't upload photos for other users |

## Step 1 — Apply the storage RLS fix

Go to **Supabase Dashboard → SQL Editor**, paste the full contents of `supabase/migrations/20260723_fix_avatars_storage_rls.sql` and run it.

> This drops and recreates all four `storage.objects` policies for the `avatars` bucket.  
> `DROP POLICY IF EXISTS` is safe — no errors if they don't exist yet.

**What the new policies do:**

| Policy | Who | Action | Rule |
|--------|-----|--------|------|
| `avatars_insert` | Authenticated | INSERT | Own path (`avatars/<uid>%`) OR admin role |
| `avatars_update` | Authenticated | UPDATE | Own path OR admin role |
| `avatars_select` | Public | SELECT | All avatars (bucket is public) |
| `avatars_delete` | Authenticated | DELETE | Own path OR admin role |

Admin check uses `LOWER(role) IN ('admin', 'superadmin', 'super_admin')` — handles all DB casing formats.

---

## Step 2 — Diagnose users with broken avatar URLs

After applying the fix, run this to find profiles whose `avatar_url` column is set but the actual file is missing from storage:

```sql
SELECT
  p.id,
  p.full_name,
  p.role,
  p.avatar_url
FROM public.profiles p
WHERE p.avatar_url IS NOT NULL
  AND p.avatar_url <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'avatars'
      AND p.avatar_url LIKE '%' || o.name || '%'
  )
ORDER BY p.full_name;
```

---

## Step 3 — Clear broken avatar URLs

For every user from Step 2 the `avatar_url` points to a file that never made it to storage (upload was blocked by the old broken RLS). Clear those URLs so the UI shows "Upload photo" instead of a broken image:

```sql
UPDATE public.profiles p
SET avatar_url = NULL
WHERE p.avatar_url IS NOT NULL
  AND p.avatar_url <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'avatars'
      AND p.avatar_url LIKE '%' || o.name || '%'
  );
```

> After this, affected users will see "No photo yet" and can re-upload — which will now succeed with the fixed policies.

---

## Step 4 — Verify

```sql
-- Should return 0 after clean-up
SELECT COUNT(*) AS still_broken
FROM public.profiles p
WHERE p.avatar_url IS NOT NULL
  AND p.avatar_url <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'avatars'
      AND p.avatar_url LIKE '%' || o.name || '%'
  );
```

---

## Code fixes already deployed (no manual action needed)

| File | Fix |
|------|-----|
| `src/pages/Settings.tsx` | Avatar upload now uses `UUID.ext` (not `UUID-timestamp.ext`) matching the RLS policy. Cache-busting `?t=Date.now()` added to the returned URL. |
| `src/context/user/UserContext.tsx` | Realtime `profiles-updates` subscription now propagates `role`, `avatar_url`, `full_name`, `email`, `status`, `hub_id` etc — logged-in user's sidebar role/avatar updates live when an admin changes it, no page reload needed. |
| `src/context/user/UserContext.tsx` | RPC fallback `admin_update_profile` no longer sends `new_avatar_url: null` when the caller didn't change the photo, preventing silent photo wipes during admin role edits. |
| `src/components/AppSidebar.tsx` | `getPrimaryRole()` now covers all roles: `employee`, `hr`, `hrManager`, `countryDirector`, `projectManager`, `reviewer`, `dataTeam`, `hubSupervisor`, `seniorOperationsLead`. |
