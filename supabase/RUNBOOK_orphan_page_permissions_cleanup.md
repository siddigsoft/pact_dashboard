# Runbook — Orphan page-permissions cleanup

## When to run this

Run this runbook whenever a page is **removed** from `PAGE_DEFS` in
`src/pages/PageAccessControl.tsx` and a production deploy is pushed.  
Without cleanup, the removed page's slug remains in:

- `public.page_access_overrides` (rows with the old `page_slug`)
- `public.user_screen_permissions.screens` (jsonb entries with the old `screenId`)

These orphan records waste storage and can confuse future admins who see
blocked/granted permissions for pages that no longer exist.

---

## Step 1 — Update the valid-slug list in the migration file

Open `supabase/migrations/cleanup_orphan_page_permissions.sql`.

Find the `valid_slugs` array inside the `DO $$ ... $$` block and **remove the slug
you deleted** from PAGE_DEFS.  
Update the "Last synced" date comment at the top of the file.

To get the current full slug list at any time, run:

```bash
grep -o "slug:'[^']*'" src/pages/PageAccessControl.tsx \
  | sed "s/slug:'//;s/'//" \
  | sort -u
```

---

## Step 2 — Run the migration in Supabase SQL Editor

1. Open **Supabase Dashboard → SQL Editor**  
2. Paste the full contents of `cleanup_orphan_page_permissions.sql`  
3. Click **Run**

The script prints a `NOTICE` line for each table showing how many rows were affected:

```
NOTICE: page_access_overrides: deleted 3 orphan row(s)
NOTICE: user_screen_permissions: cleaned orphan screen entries from 12 row(s)
```

The script is **idempotent** — running it multiple times is safe; subsequent runs
will always report 0 rows.

---

## Step 3 — Verify

```sql
-- Should return 0 rows for each removed slug
SELECT page_slug, count(*)
FROM public.page_access_overrides
WHERE page_slug = 'your-removed-slug'
GROUP BY 1;

-- Should return 0 elements per row containing the removed slug
SELECT id, jsonb_array_length(screens) AS total_screens
FROM public.user_screen_permissions
WHERE screens @> '[{"screenId": "your-removed-slug"}]';
```

---

## How the save-path guard works (automatic protection)

`PermissionsManagement.tsx` → `saveUserPermissions()` filters `screens` through
the current `SYSTEM_SCREENS` list before writing to the database.  Any `screenId`
that has no matching `PAGE_DEFS` slug is silently stripped at save time.  This
means:

- **New orphans cannot accumulate** once the code is deployed
- The SQL migration is only needed to clean up **pre-existing** stale records

---

## Related files

| File | Purpose |
|------|---------|
| `src/pages/PageAccessControl.tsx` | Source of truth for all valid `page_slug` values (`PAGE_DEFS`) |
| `src/pages/PermissionsManagement.tsx` | `saveUserPermissions()` strips orphans on every save |
| `supabase/migrations/cleanup_orphan_page_permissions.sql` | One-time and re-runnable cleanup SQL |
