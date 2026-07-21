-- Fix workspace_folders: strip leading "folder " prefix from names
-- Example: "folder HR" → "HR",  "folder WFP-TPM" → "WFP-TPM"

UPDATE workspace_folders
SET name = trim(regexp_replace(name, '^folder\s+', '', 'i'))
WHERE name ~* '^folder\s+';
