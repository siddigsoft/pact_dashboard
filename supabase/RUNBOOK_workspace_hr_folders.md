# Runbook: Create HR Folder Structure in Workspace Hub

Run this SQL in the **Supabase SQL Editor** (bypasses RLS via service role).

## Step 1 — Create top-level HR folder

```sql
INSERT INTO workspace_folders (name, parent_folder_id, security_level, is_system_folder, archived)
SELECT 'HR', NULL, 'internal', false, false
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_folders
  WHERE name = 'HR' AND parent_folder_id IS NULL AND archived = false
);
```

## Step 2 — Create Profiles subfolder under HR

```sql
INSERT INTO workspace_folders (name, parent_folder_id, security_level, is_system_folder, archived)
SELECT 'Profiles', f.id, 'internal', false, false
FROM workspace_folders f
WHERE f.name = 'HR' AND f.parent_folder_id IS NULL AND f.archived = false
AND NOT EXISTS (
  SELECT 1 FROM workspace_folders
  WHERE name = 'Profiles' AND parent_folder_id = f.id AND archived = false
);
```

## Step 3 — Verify

```sql
SELECT id, name, parent_folder_id, security_level
FROM workspace_folders
WHERE name IN ('HR', 'Profiles') AND archived = false
ORDER BY name;
```

You should see two rows: one for `HR` (parent_folder_id = null) and one for `Profiles` (parent_folder_id = HR folder's id).

---

## Notes

- Individual employee sub-folders (e.g. `SD20260701_Mukisa_Christian`) are created automatically the next time each employee's profile page is opened in the app.
- After running Steps 1–2, open any employee profile and the system will create their personal sub-folder inside `HR / Profiles /`.
- The Workspace Hub caches folder data for 5 minutes. Refresh the page after running the SQL.
