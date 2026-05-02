-- Reset any MMP records stuck in cycle-close statuses back to 'active'.
-- Run this in the Supabase SQL editor.
-- Safe to run multiple times (idempotent).

-- Show what will be reset before running the UPDATE:
SELECT id, name, cycle_status
FROM mmp_files
WHERE cycle_status IN ('closing', 'pending_approval')
ORDER BY name;

-- Reset them all to 'active' and clear cycle-close fields:
UPDATE mmp_files
SET
  cycle_status        = 'active',
  cycle_closed_at     = NULL,
  cycle_closed_by     = NULL,
  cycle_close_records = '[]'::jsonb,
  cycle_approval_note = NULL,
  payment_tracking    = NULL
WHERE cycle_status IN ('closing', 'pending_approval');

-- Confirm nothing is left in a stuck state:
SELECT COUNT(*) AS still_stuck
FROM mmp_files
WHERE cycle_status IN ('closing', 'pending_approval');
