-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK_profile_fk_health.sql
--
-- Purpose: Detect any foreign-key columns that reference profiles(id) WITHOUT
--   an explicit ON DELETE rule (Postgres default = NO ACTION, which blocks
--   profile/user deletes with a constraint violation).
--
-- When to run:
--   • Before every major release
--   • After any migration that adds a new table or new FK column
--   • As part of a CI pre-deploy checklist in the Supabase SQL Editor
--
-- How to run:
--   Open Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Expected result: ZERO rows returned.
--   Any row returned is a bare FK that will block user deletion.
--   Fix it with one of the two patterns in the "How to fix" section below.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
    tc.table_name                   AS table_name,
    kcu.column_name                 AS column_name,
    tc.constraint_name              AS constraint_name,
    rc.delete_rule                  AS delete_rule,
    -- Hint: authorship/audit columns → SET NULL; ownership columns → CASCADE
    CASE
        WHEN kcu.column_name IN (
            'created_by', 'updated_by', 'deleted_by',
            'uploaded_by', 'assigned_by', 'approved_by',
            'rejected_by', 'reviewed_by', 'submitted_by',
            'triggered_by', 'modified_by', 'closed_by',
            'verified_by', 'processed_by', 'archived_by',
            'author_id', 'reviewer_id', 'approver_id'
        ) THEN 'LIKELY needs ON DELETE SET NULL (audit/authorship column)'
        ELSE 'REVIEW: may need ON DELETE CASCADE if row is meaningless without the profile'
    END                             AS suggested_fix
FROM information_schema.table_constraints  tc
JOIN information_schema.key_column_usage   kcu
    ON  kcu.constraint_name = tc.constraint_name
    AND kcu.table_schema    = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON  rc.constraint_name  = tc.constraint_name
    AND rc.constraint_schema = tc.constraint_schema
JOIN information_schema.key_column_usage   ccu
    ON  ccu.constraint_name  = rc.unique_constraint_name
    AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name     = 'profiles'
  AND ccu.column_name    = 'id'
  AND rc.delete_rule     = 'NO ACTION'   -- bare FK — no explicit ON DELETE
ORDER BY tc.table_name, kcu.column_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- How to fix any row that appears above
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Pattern A — authorship / audit columns (created_by, uploaded_by, etc.)
--   The child row must survive after the user is deleted; the author cell
--   becomes NULL to indicate "deleted user".
--
--   ALTER TABLE <table_name>
--     DROP CONSTRAINT IF EXISTS <constraint_name>;
--   ALTER TABLE <table_name>
--     ADD CONSTRAINT <constraint_name>
--     FOREIGN KEY (<column_name>) REFERENCES profiles(id) ON DELETE SET NULL;
--
--
-- Pattern B — ownership columns (profile_id, user_id as primary subject)
--   The child row is meaningless without the profile; delete it automatically.
--
--   ALTER TABLE <table_name>
--     DROP CONSTRAINT IF EXISTS <constraint_name>;
--   ALTER TABLE <table_name>
--     ADD CONSTRAINT <constraint_name>
--     FOREIGN KEY (<column_name>) REFERENCES profiles(id) ON DELETE CASCADE;
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration template for NEW tables
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Always specify ON DELETE explicitly. Copy the relevant pattern:
--
--   -- Authorship column (preserve the row, null the author):
--   created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
--   uploaded_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
--
--   -- Ownership column (delete the child row with the profile):
--   profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
--   user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
--
-- NEVER write:
--   created_by uuid REFERENCES profiles(id),   -- ← missing ON DELETE → blocks user delete
-- ─────────────────────────────────────────────────────────────────────────────
