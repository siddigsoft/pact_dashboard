-- Archive the duplicate workspace folder created with a double-i typo.
-- The canonical folder is UG202607210007_Hope_Birungi (single i).
-- The duplicate UG202607210007_Hope_Birungii (double i) should be archived.
-- Any files in the duplicate are moved to the canonical folder first.

DO $$
DECLARE
  v_canonical_id UUID;
  v_duplicate_id UUID;
BEGIN
  -- Find canonical folder
  SELECT id INTO v_canonical_id
  FROM workspace_folders
  WHERE name = 'UG202607210007_Hope_Birungi'
    AND archived = false
  LIMIT 1;

  -- Find duplicate folder (double-i)
  SELECT id INTO v_duplicate_id
  FROM workspace_folders
  WHERE name = 'UG202607210007_Hope_Birungii'
    AND archived = false
  LIMIT 1;

  IF v_duplicate_id IS NOT NULL THEN
    -- Move any files from duplicate to canonical (if canonical exists)
    IF v_canonical_id IS NOT NULL THEN
      UPDATE workspace_files
      SET folder_id  = v_canonical_id,
          updated_at = now()
      WHERE folder_id = v_duplicate_id;
    END IF;

    -- Archive the duplicate folder
    UPDATE workspace_folders
    SET archived = true
    WHERE id = v_duplicate_id;

    RAISE NOTICE 'Archived duplicate folder UG202607210007_Hope_Birungii (id: %)', v_duplicate_id;
  ELSE
    RAISE NOTICE 'Duplicate folder not found or already archived — nothing to do.';
  END IF;
END $$;
