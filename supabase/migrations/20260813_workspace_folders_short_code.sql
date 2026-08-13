-- Add short_code to workspace_folders so share links are human-readable and short.
-- Existing folders get an 8-char alphanumeric code derived from the first segment
-- of their UUID (no dashes, lowercase). New folders will receive a code from the
-- client at insert time using the same algorithm.

ALTER TABLE workspace_folders ADD COLUMN IF NOT EXISTS short_code VARCHAR(12) UNIQUE;

-- Backfill existing rows: use first 8 chars of uuid, lower-cased, dashes stripped
UPDATE workspace_folders
SET short_code = LOWER(REPLACE(SUBSTRING(id::text, 1, 8), '-', ''))
WHERE short_code IS NULL;

-- For the rare case where two folders share a first-8-char prefix, fall back to
-- the full 32-char hex (still no dashes).
UPDATE workspace_folders f
SET short_code = LOWER(REPLACE(id::text, '-', ''))
WHERE short_code IN (
  SELECT short_code FROM workspace_folders
  GROUP BY short_code HAVING COUNT(*) > 1
);
