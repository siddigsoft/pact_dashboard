-- ─────────────────────────────────────────────────────────────────────────────
-- fix_bare_profile_fk_on_delete.sql
--
-- Purpose:
--   Fix every existing public.* foreign key that references profiles(id) but
--   was created without an explicit ON DELETE rule (Postgres default = NO ACTION,
--   which blocks user-profile deletion with a constraint violation).
--
-- Strategy:
--   Authorship / audit columns  → ON DELETE SET NULL   (row survives, author gone)
--   Ownership / subject columns → ON DELETE CASCADE    (row is meaningless without the user)
--
-- This migration discovers and fixes bare FKs dynamically so it is robust to
-- auto-generated constraint names and doesn't require enumerating each table.
-- It is idempotent: constraints that already have an explicit ON DELETE rule
-- are skipped.
--
-- After this migration runs the CHECK_profile_fk_health.sql query should
-- return zero rows.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  delete_rule TEXT;
BEGIN
  FOR r IN (
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints     tc
    JOIN information_schema.key_column_usage      kcu
      ON  kcu.constraint_name   = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON  rc.constraint_name   = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    JOIN information_schema.table_constraints     ftc
      ON  ftc.constraint_name   = rc.unique_constraint_name
      AND ftc.constraint_schema = rc.unique_constraint_schema
    JOIN information_schema.key_column_usage      fkcu
      ON  fkcu.constraint_name   = ftc.constraint_name
      AND fkcu.constraint_schema = ftc.constraint_schema
    WHERE tc.constraint_type      = 'FOREIGN KEY'
      AND tc.constraint_schema    = 'public'
      AND ftc.table_schema        = 'public'
      AND ftc.table_name          = 'profiles'
      AND fkcu.column_name        = 'id'
      AND rc.delete_rule          = 'NO ACTION'   -- only bare FKs
    ORDER BY tc.table_name, kcu.column_name
  ) LOOP

    -- ── Decide the rule ──────────────────────────────────────────────────────
    -- Authorship / audit columns: the child row has independent value; just
    -- null out the reference when the profile is deleted.
    IF r.column_name IN (
        'created_by',       'updated_by',        'deleted_by',
        'uploaded_by',      'assigned_by',        'approved_by',
        'rejected_by',      'submitted_by',       'initiated_by',
        'processed_by',     'reviewed_by',        'triggered_by',
        'modified_by',      'closed_by',          'author_id',
        'reviewer_id',      'approver_id',        'restored_by',
        'adjusted_by',      'calculated_by',      'appointed_by',
        'deactivated_by',   'admin_processed_by', 'supervisor_approved_by',
        'requested_by',     'supervisor_id',      'data_collector_id',
        'verified_by',      'archived_by',        'confirmed_by',
        'cancelled_by',     'recalled_by'
    ) THEN
      delete_rule := 'SET NULL';
    ELSE
      -- Ownership columns (user_id, profile_id as the row's primary subject):
      -- the child row is meaningless without the profile; cascade the delete.
      delete_rule := 'CASCADE';
    END IF;

    -- ── Apply the fix ────────────────────────────────────────────────────────
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        r.table_name, r.constraint_name
      );
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE %s',
        r.table_name, r.constraint_name, r.column_name, delete_rule
      );
      RAISE NOTICE 'Fixed: %.% (constraint: %) → ON DELETE %',
        r.table_name, r.column_name, r.constraint_name, delete_rule;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not fix %.% (constraint: %): %',
        r.table_name, r.column_name, r.constraint_name, SQLERRM;
    END;

  END LOOP;
END $$;
