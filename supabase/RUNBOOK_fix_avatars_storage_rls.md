# Runbook: Fix Avatars Storage RLS Policies

## Problem
Two bugs in the `avatars` storage bucket RLS policies:

1. **Admin INSERT policy failed** — checked `role IN ('Admin','SuperAdmin')` but the database stores roles in mixed case (`'admin'`, `'super_admin'`, `'Admin'`). Case-sensitive mismatch caused all admin avatar uploads for other users to fail with "new row violates row-level security policy".

2. **UPDATE policy was broken for everyone** — used `split_part(name, '/', 2)` which extracts `"abc-123.jpg"` (with extension) from path `"avatars/abc-123.jpg"`, never matching `auth.uid()`. This means re-uploading / upsert (`{ upsert: true }`) always fails on the second upload for any user.

## Migration File
`supabase/migrations/20260723_fix_avatars_storage_rls.sql`

## Steps — Apply in Supabase SQL Editor

1. Go to **Supabase Dashboard → SQL Editor**
2. Paste and run the full contents of `20260723_fix_avatars_storage_rls.sql`
3. Check the output — should show no errors (DROP POLICY IF EXISTS is safe even if policies don't exist yet)

## What the Migration Does

| Policy | Who | Action | Rule |
|--------|-----|--------|------|
| `avatars_insert` | Any authenticated user | INSERT | Own path (`avatars/<uid>.*`) OR admin role |
| `avatars_update` | Any authenticated user | UPDATE | Own path OR admin role |
| `avatars_select` | Public | SELECT | All avatars (bucket is public) |
| `avatars_delete` | Any authenticated user | DELETE | Own path OR admin role |

Admin check uses `LOWER(role) IN ('admin', 'superadmin', 'super_admin')` — case-insensitive, handles all DB storage formats.

## Verification

After running the migration:
1. Log in as an **Admin** user
2. Open any staff member's profile
3. Click **Upload Photo** and select an image
4. Confirm the photo uploads successfully with no RLS error

## No Rollback Needed
All policies are recreated cleanly. If there is an issue, re-run with the original `create_avatars_bucket.sql` content to restore the previous (partially broken) policies.
