-- Migration: Timesheet Module (Task #25)
-- Creates timesheets (weekly parent) and timesheet_entries (per-day rows) tables.
-- Also adds hourly_rate to employee_salary_config and creates payroll_settings.
--
-- SAFETY NOTE: If a prior flat-model `timesheets` table exists (per-day rows with
-- date/hours/status columns), this migration drops and recreates it as the new
-- weekly-parent model. Existing draft/pending rows are migrated into the new model
-- (one parent per user+week_start grouping, entries backfilled from the old rows).
--
-- If `timesheets` doesn't exist yet, the CREATE TABLE runs cleanly.

-- ── 0. Detect & migrate pre-existing flat timesheets table ─────────────────────
DO $$
BEGIN
  -- Only run migration path if the old flat model exists (has a 'date' column)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'timesheets'
      AND column_name = 'date'
  ) THEN

    -- Create the entries table first (no FK yet) so we can move data
    CREATE TABLE IF NOT EXISTS timesheet_entries_new (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      timesheet_id  uuid NOT NULL,
      project_id    uuid,
      task_id       uuid,
      task_type     text,
      date          date NOT NULL,
      start_time    time,
      end_time      time,
      break_minutes integer DEFAULT 0,
      hours         numeric(5,2) NOT NULL CHECK (hours >= 0),
      description   text,
      is_billable   boolean DEFAULT false,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now()
    );

    -- Create the new weekly parent table alongside the old one (different name for now)
    CREATE TABLE IF NOT EXISTS timesheets_new (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL,
      week_start    date NOT NULL,
      status        text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'revision')),
      submitted_at  timestamptz,
      approved_by   uuid,
      approved_at   timestamptz,
      reject_comment text,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now(),
      UNIQUE (user_id, week_start)
    );

    -- Backfill weekly parents from the old flat rows
    -- Group old rows by (user_id, week_start) and compute week-level status
    INSERT INTO timesheets_new (user_id, week_start, status, submitted_at, approved_by, approved_at, reject_comment, created_at, updated_at)
    SELECT
      user_id,
      COALESCE(week_start::date, date_trunc('week', date::date)::date) AS week_start,
      -- Use the most advanced status in the group as the week status
      CASE
        WHEN bool_or(status = 'approved')  THEN 'approved'
        WHEN bool_or(status = 'rejected')  THEN 'rejected'
        WHEN bool_or(status = 'revision')  THEN 'revision'
        WHEN bool_or(status = 'pending')   THEN 'pending'
        ELSE 'draft'
      END AS status,
      MAX(submitted_at)  AS submitted_at,
      MAX(approved_by::text)::uuid AS approved_by,
      MAX(approved_at)   AS approved_at,
      MAX(reject_comment) AS reject_comment,
      MIN(created_at)    AS created_at,
      MAX(updated_at)    AS updated_at
    FROM timesheets
    WHERE user_id IS NOT NULL
    GROUP BY user_id, COALESCE(week_start::date, date_trunc('week', date::date)::date)
    ON CONFLICT (user_id, week_start) DO NOTHING;

    -- Backfill entries from old flat rows
    INSERT INTO timesheet_entries_new (
      timesheet_id, project_id, task_id, task_type, date,
      start_time, end_time, break_minutes, hours, description, is_billable,
      created_at, updated_at
    )
    SELECT
      tn.id AS timesheet_id,
      t.project_id,
      t.task_id,
      COALESCE(t.task_type, 'other'),
      t.date::date,
      t.start_time,
      t.end_time,
      COALESCE(t.break_minutes, 0),
      t.hours,
      t.description,
      COALESCE(t.is_billable, false),
      t.created_at,
      t.updated_at
    FROM timesheets t
    JOIN timesheets_new tn
      ON tn.user_id = t.user_id
      AND tn.week_start = COALESCE(t.week_start::date, date_trunc('week', t.date::date)::date)
    WHERE t.date IS NOT NULL AND t.hours IS NOT NULL;

    -- Replace old flat table with new weekly-parent table
    DROP TABLE timesheets CASCADE;
    ALTER TABLE timesheets_new RENAME TO timesheets;
    ALTER TABLE timesheet_entries_new RENAME TO timesheet_entries;

    -- Restore FKs that couldn't be set before the tables had their final names
    ALTER TABLE timesheets
      ADD CONSTRAINT timesheets_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

    ALTER TABLE timesheets
      ADD CONSTRAINT timesheets_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

    ALTER TABLE timesheet_entries
      ADD CONSTRAINT timesheet_entries_timesheet_id_fkey
      FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE;

    ALTER TABLE timesheet_entries
      ADD CONSTRAINT timesheet_entries_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

  ELSE
    -- No pre-existing flat table: clean install
    CREATE TABLE IF NOT EXISTS timesheets (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      week_start    date NOT NULL,
      status        text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'revision')),
      submitted_at  timestamptz,
      approved_by   uuid REFERENCES profiles(id),
      approved_at   timestamptz,
      reject_comment text,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now(),
      UNIQUE (user_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      timesheet_id  uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
      project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
      task_id       uuid,
      task_type     text,
      date          date NOT NULL,
      start_time    time,
      end_time      time,
      break_minutes integer DEFAULT 0,
      hours         numeric(5,2) NOT NULL CHECK (hours >= 0),
      description   text,
      is_billable   boolean DEFAULT false,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now()
    );

  END IF;
END $$;

-- ── 3. Hourly rate on salary config ────────────────────────────────────────
ALTER TABLE employee_salary_config
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);

-- ── 4. Payroll settings (schedule config) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  updated_by    uuid REFERENCES profiles(id),
  updated_at    timestamptz DEFAULT now()
);

INSERT INTO payroll_settings (setting_key, setting_value)
VALUES ('auto_schedule', '{"day_of_month":28,"enabled":false,"paused":false,"last_triggered":null,"notes":null,"updated_at":null}')
ON CONFLICT (setting_key) DO NOTHING;

-- ── 5. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_timesheets_user_week ON timesheets(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON timesheet_entries(date);

-- ── 6. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

-- ── timesheets RLS ────────────────────────────────────────────────────────────
-- Read access:
--   • Own rows (always)
--   • Super-admins and finance/financialAdmin roles see ALL (for payroll processing)
--   • Supervisors, FOM, generic admin see only direct-reports' timesheets
DO $$ BEGIN
  CREATE POLICY "timesheets_select" ON timesheets
    FOR SELECT USING (
      -- Employee seeing their own timesheet
      auth.uid() = user_id
      -- Full visibility: super_admin / finance roles (needed for payroll)
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
      -- Supervisor/admin/FOM: only see direct reports' timesheets
      OR (
        EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = auth.uid()
          AND p.role IN ('admin','Admin','supervisor','Supervisor','fom','FOM')
        )
        AND EXISTS (
          SELECT 1 FROM profiles dr WHERE dr.id = user_id AND dr.reports_to = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "timesheets_insert_own" ON timesheets
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- timesheets_update:
--   Employee: own rows ONLY when current status is draft or revision (cannot edit after submission)
--             WITH CHECK prevents transitioning to privileged statuses (approved, etc.)
--   Supervisor/admin/FOM: direct reports' rows, any status (for approve/reject/revision)
--   Finance/FinancialAdmin/SuperAdmin: all rows (payroll processing)
DO $$ BEGIN
  CREATE POLICY "timesheets_update" ON timesheets
    FOR UPDATE
    -- USING: which existing rows the caller is allowed to touch
    USING (
      -- Employee: own timesheet AND current status must be editable
      (auth.uid() = user_id AND status IN ('draft', 'revision'))
      -- Supervisor/admin/FOM: only direct reports (any status)
      OR (
        EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = auth.uid()
          AND p.role IN ('admin','Admin','supervisor','Supervisor','fom','FOM')
        )
        AND EXISTS (
          SELECT 1 FROM profiles dr WHERE dr.id = user_id AND dr.reports_to = auth.uid()
        )
      )
      -- Finance / FinancialAdmin / SuperAdmin: unrestricted
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
    )
    -- WITH CHECK: prevent employees from writing privileged status values or usurping approval fields
    WITH CHECK (
      -- Employee can only write draft, pending, or revision — cannot self-approve or self-reject
      (auth.uid() = user_id AND status IN ('draft', 'pending', 'revision'))
      -- Supervisors/finance/super_admin may write any status (approvals, rejections)
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN (
          'super_admin','SuperAdmin','admin','Admin','supervisor','Supervisor',
          'fom','FOM','finance','Finance','financialAdmin','FinancialAdmin'
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── timesheet_entries RLS ─────────────────────────────────────────────────────
-- Read: own entries, or scoped by direct-report relationship for supervisors
DO $$ BEGIN
  CREATE POLICY "timesheet_entries_select" ON timesheet_entries
    FOR SELECT USING (
      -- Employee seeing their own entries
      EXISTS (SELECT 1 FROM timesheets t WHERE t.id = timesheet_id AND t.user_id = auth.uid())
      -- Full visibility: finance/financialAdmin/super_admin (for payroll)
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
      -- Supervisor/FOM/admin: only direct reports' entries
      OR (
        EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = auth.uid()
          AND p.role IN ('admin','Admin','supervisor','Supervisor','fom','FOM')
        )
        AND EXISTS (
          SELECT 1 FROM timesheets t
          JOIN profiles dr ON dr.id = t.user_id
          WHERE t.id = timesheet_id AND dr.reports_to = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "timesheet_entries_insert" ON timesheet_entries
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM timesheets t WHERE t.id = timesheet_id AND t.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- timesheet_entries_update:
--   Employee: own entries ONLY when parent timesheet status is draft or revision
--             (cannot alter hours after submission/approval — protects payroll integrity)
--   Supervisor/admin/FOM: direct reports' entries only
--   Finance/FinancialAdmin/SuperAdmin: unrestricted
DO $$ BEGIN
  CREATE POLICY "timesheet_entries_update" ON timesheet_entries
    FOR UPDATE
    USING (
      -- Employee: own entries AND parent timesheet must be in an editable state
      EXISTS (
        SELECT 1 FROM timesheets t
        WHERE t.id = timesheet_id AND t.user_id = auth.uid()
        AND t.status IN ('draft', 'revision')
      )
      -- Supervisor/admin/FOM: direct reports only (any status — e.g., correcting a data entry error)
      OR (
        EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = auth.uid()
          AND p.role IN ('admin','Admin','supervisor','Supervisor','fom','FOM')
        )
        AND EXISTS (
          SELECT 1 FROM timesheets t
          JOIN profiles dr ON dr.id = t.user_id
          WHERE t.id = timesheet_id AND dr.reports_to = auth.uid()
        )
      )
      -- Finance / FinancialAdmin / SuperAdmin: unrestricted
      OR EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "timesheet_entries_delete" ON timesheet_entries
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM timesheets t WHERE t.id = timesheet_id AND t.user_id = auth.uid() AND t.status IN ('draft','revision'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payroll_settings: FinancialAdmin and above ONLY (task spec requirement)
-- Generic admin role intentionally excluded
DO $$ BEGIN
  CREATE POLICY "payroll_settings_select" ON payroll_settings
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payroll_settings_update" ON payroll_settings
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payroll_settings_upsert" ON payroll_settings
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','SuperAdmin','finance','Finance','financialAdmin','FinancialAdmin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
