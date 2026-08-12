# Runbook: Fix RLS on column_visibility_config, data_scope_config, page_role_configs

## Problem

Column visibility rules and data scope restrictions are silently ignored for some users
because the underlying tables have RLS enabled but no SELECT policy — so queries
return an empty array without an error. Admins may believe they've configured column
restrictions or hub data scopes, but the settings are never applied.

Additionally, `page_role_configs` (which controls which roles can access each page by
default in the By-Page view) fails silently for non-super-admin accounts.

## Fix

**File:** `supabase/migrations/20260812_access_config_tables_rls.sql`

---

## Steps

### 1. Open Supabase Studio SQL Editor

Navigate to: **https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/sql/new**

### 2. Paste and run the migration

Copy the full contents of `supabase/migrations/20260812_access_config_tables_rls.sql`
and execute it.

The script is idempotent — it uses `DROP POLICY IF EXISTS` before every
`CREATE POLICY`, so it is safe to run more than once.

> **Note:** This migration also calls `CREATE OR REPLACE FUNCTION workspace_check_super_admin()`.
> If you already ran the workspace_access_grants RLS migration, this is a no-op re-definition.

### 3. Verify policies were created

Run this verification query:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'column_visibility_config',
  'data_scope_config',
  'page_role_configs'
)
ORDER BY tablename, cmd;
```

**Expected results (10 rows):**

| tablename | policyname | cmd |
|---|---|---|
| column_visibility_config | column_visibility_config_delete | DELETE |
| column_visibility_config | column_visibility_config_insert | INSERT |
| column_visibility_config | column_visibility_config_select | SELECT |
| column_visibility_config | column_visibility_config_update | UPDATE |
| data_scope_config | data_scope_config_delete | DELETE |
| data_scope_config | data_scope_config_insert | INSERT |
| data_scope_config | data_scope_config_select | SELECT |
| data_scope_config | data_scope_config_update | UPDATE |
| page_role_configs | page_role_configs_delete | DELETE |
| page_role_configs | page_role_configs_insert | INSERT |
| page_role_configs | page_role_configs_select | SELECT |
| page_role_configs | page_role_configs_update | UPDATE |

### 4. Verify helper functions exist

```sql
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('workspace_check_super_admin', 'access_config_check_admin_or_above');
```

Both rows should have `prosecdef = true`.

### 5. Smoke test

As a Super Admin user on the app:

1. Open **Access Manager → select any non-admin user → Column Visibility tab**
2. Hide a column for that user — confirm the save succeeds (no error toast)
3. Open **Access Manager → Page Access → By Page**
4. Change the role defaults for any page — confirm save succeeds
5. Select a non-admin user in the app and navigate to the page you restricted —
   confirm the hidden column is absent

As a regular **Admin** user:
1. Open **Access Manager → Page Access → By Page**
2. Confirm the page role config dropdown loads (was empty/erroring before this fix)

---

## What the migration does

| Table | Policy | Who can |
|---|---|---|
| `column_visibility_config` | SELECT | Own row **or** own-role rows **or** super_admin |
| `column_visibility_config` | INSERT / UPDATE / DELETE | super_admin only |
| `data_scope_config` | SELECT | Own row **or** own-role rows **or** super_admin |
| `data_scope_config` | INSERT / UPDATE / DELETE | super_admin only |
| `page_role_configs` | SELECT / INSERT / UPDATE | admin or super_admin |
| `page_role_configs` | DELETE | super_admin only |

Two `SECURITY DEFINER` helper functions are created/updated:
- `workspace_check_super_admin()` — checks `profiles.role` for super_admin without being blocked by profiles RLS (shared with workspace_access_grants migration)
- `access_config_check_admin_or_above()` — allows admin + super_admin write access to page_role_configs
