# Runbook: Clean Up Duplicate Workspace Profile Folders

## What happened

When "Save Employment Record" was clicked on a profile that didn't have an Employee ID yet,
the system generated a brand-new ID each time (because the local session state was never
updated with the generated ID). This caused:

- Multiple workspace folders per employee (e.g. `UG202607210002_Hope_Birungi`,
  `UG202607210003_Hope_Birungi`, `UG202607210004_Hope_Birungi`, …)
- The employee's **actual current ID** in the `profiles` table is always the
  **latest/highest-numbered one** (each save overwrote the previous).

**This is now fixed in code** — subsequent saves in the same session will no longer
re-generate a new ID.

---

## Step 1 — Identify duplicate folders

Run this query to see all employees who have more than one profile folder:

```sql
SELECT
  REGEXP_REPLACE(name, '_[^_]+_[^_]+$', '') AS employee_id_prefix,
  COUNT(*)                                  AS folder_count,
  STRING_AGG(name, ', ' ORDER BY name)      AS folder_names,
  STRING_AGG(id::text, ', ' ORDER BY name)  AS folder_ids
FROM workspace_folders
WHERE
  parent_folder_id = (
    SELECT id FROM workspace_folders
    WHERE name = 'Profiles' AND parent_folder_id = (
      SELECT id FROM workspace_folders WHERE name = 'HR' AND parent_folder_id IS NULL LIMIT 1
    )
    LIMIT 1
  )
  AND archived = false
GROUP BY REGEXP_REPLACE(name, '_[^_]+_[^_]+$', '')
HAVING COUNT(*) > 1
ORDER BY folder_count DESC;
```

---

## Step 2 — Find the correct (current) folder name per employee

The CORRECT folder name for each employee is built from their current `employee_id` in the
`profiles` table. Run this to see which folder name to keep:

```sql
SELECT
  p.id              AS profile_id,
  p.full_name,
  p.employee_id     AS current_id,
  -- The correct folder name formula (mirrors computeFolderName in code)
  CONCAT(
    REGEXP_REPLACE(p.employee_id, '[^a-zA-Z0-9]', '_', 'g'), '_',
    REGEXP_REPLACE(SPLIT_PART(TRIM(p.full_name), ' ', 1), '[^a-zA-Z0-9]', '_', 'g'), '_',
    REGEXP_REPLACE(
      SPLIT_PART(TRIM(p.full_name), ' ', ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(p.full_name), ' '), 1)),
      '[^a-zA-Z0-9]', '_', 'g'
    )
  ) AS correct_folder_name
FROM profiles p
WHERE p.employee_id IS NOT NULL
ORDER BY p.full_name;
```

---

## Step 3 — Archive duplicate (stale) folders

For each employee with duplicates, keep the folder that matches their **current** employee ID
and archive the rest. Replace `'HR_PROFILES_PARENT_UUID'` with the actual Profiles folder ID
found in Step 1.

```sql
-- Archive all profile folders whose name does NOT match the correct current folder name.
-- This is safe: archived folders are hidden from the UI but not deleted.
UPDATE workspace_folders wf
SET archived = true
WHERE
  wf.parent_folder_id = (
    SELECT id FROM workspace_folders
    WHERE name = 'Profiles' AND parent_folder_id = (
      SELECT id FROM workspace_folders WHERE name = 'HR' AND parent_folder_id IS NULL LIMIT 1
    )
    LIMIT 1
  )
  AND wf.archived = false
  AND NOT EXISTS (
    -- Keep this folder if its name matches the profile's current employee_id
    SELECT 1
    FROM profiles p
    WHERE wf.name LIKE CONCAT(
      REGEXP_REPLACE(p.employee_id, '[^a-zA-Z0-9]', '_', 'g'), '%'
    )
    AND p.employee_id IS NOT NULL
  );
```

> **Review before running** — paste the SELECT version first (replace `UPDATE ... SET archived = true` with `SELECT wf.name, wf.id`) to see which folders will be archived.

---

## Step 4 — Verify

```sql
-- Should return 0 rows (no more duplicates)
SELECT COUNT(*), STRING_AGG(name, ', ') AS duplicates
FROM workspace_folders
WHERE
  parent_folder_id = (
    SELECT id FROM workspace_folders
    WHERE name = 'Profiles' AND parent_folder_id = (
      SELECT id FROM workspace_folders WHERE name = 'HR' AND parent_folder_id IS NULL LIMIT 1
    )
    LIMIT 1
  )
  AND archived = false
GROUP BY REGEXP_REPLACE(name, '_[^_]+_[^_]+$', '')
HAVING COUNT(*) > 1;
```

---

## Code fix applied (no manual action needed)

`src/pages/UserDetail.tsx` — `handleEmploymentSave` now:
1. Sets local `user.employeeId` immediately after auto-generating a new ID
2. Passes the fresh user (with the new ID) to `triggerFolderSync` instead of the stale closure

This prevents any future duplicate folder creation from multiple saves in the same session.
