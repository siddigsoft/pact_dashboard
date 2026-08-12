# Runbook: Fix Workspace Access Grants RLS

## Problem

Clicking **Grant Access** in the Workspace Access Control dialog fails with:

> Error granting access — new row violates row-level security policy for table "workspace_access_grants"

The `workspace_access_grants`, `workspace_access_requests`, and `workspace_security_clearances` tables have RLS enabled but their INSERT/UPDATE policies are missing or misconfigured (the tables were created without tracked migrations).

## Fix

**File:** `supabase/migrations/20260812_workspace_access_grants_rls.sql`

---

## Steps

### 1. Open Supabase Studio SQL Editor

Navigate to: **https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/sql/new**

### 2. Paste and run the migration

Copy the full contents of `supabase/migrations/20260812_workspace_access_grants_rls.sql` and execute it.

The script is idempotent — it uses `DROP POLICY IF EXISTS` before every `CREATE POLICY`, so it is safe to run more than once.

### 3. Verify policies were created

Run this verification query:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'workspace_access_grants',
  'workspace_access_requests',
  'workspace_security_clearances'
)
ORDER BY tablename, cmd;
```

**Expected results:**

| tablename | policyname | cmd |
|---|---|---|
| workspace_access_grants | workspace_access_grants_delete | DELETE |
| workspace_access_grants | workspace_access_grants_insert | INSERT |
| workspace_access_grants | workspace_access_grants_select | SELECT |
| workspace_access_grants | workspace_access_grants_update | UPDATE |
| workspace_access_requests | workspace_access_requests_insert | INSERT |
| workspace_access_requests | workspace_access_requests_select | SELECT |
| workspace_access_requests | workspace_access_requests_update | UPDATE |
| workspace_security_clearances | workspace_security_clearances_delete | DELETE |
| workspace_security_clearances | workspace_security_clearances_insert | INSERT |
| workspace_security_clearances | workspace_security_clearances_select | SELECT |
| workspace_security_clearances | workspace_security_clearances_update | UPDATE |

### 4. Verify the helper function

```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'is_super_admin';
```

Should return one row with `prosecdef = true`.

### 5. Smoke test

As a Super Admin user on the app:
1. Open **Workspace Hub → Workspace Access Control**
2. Switch to the **Grant Access** tab
3. Select any user and click **Grant Access**
4. Confirm no error toast appears and the user now shows as **Active** in the Users tab
5. Test revoking and restoring the same user

---

## What the migration does

| Table | Policy | Who can |
|---|---|---|
| `workspace_access_grants` | SELECT | Own row **or** super_admin |
| `workspace_access_grants` | INSERT | super_admin only (`granted_by = auth.uid()`) |
| `workspace_access_grants` | UPDATE | super_admin only |
| `workspace_access_grants` | DELETE | super_admin only |
| `workspace_access_requests` | SELECT | Own row **or** super_admin |
| `workspace_access_requests` | INSERT | Any authenticated user (self only) |
| `workspace_access_requests` | UPDATE | super_admin only (approve/reject) |
| `workspace_security_clearances` | SELECT | Own row **or** super_admin |
| `workspace_security_clearances` | INSERT/UPDATE/DELETE | super_admin only |

A `SECURITY DEFINER` helper function `is_super_admin()` is created to check `profiles.role` without being blocked by profiles' own RLS.
