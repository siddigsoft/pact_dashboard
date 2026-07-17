-- 2025-11-12_fix_location_logs_and_reports.sql
-- Purpose: Align DB schema with mobile app usage
-- - Ensure location_logs has altitude and other optional columns
-- - Ensure reports and report_photos exist with fields used by the app
-- - Keep RLS compatible with user ownership

-- 1) LOCATION LOGS: add missing columns if needed
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'altitude'
	) THEN
		ALTER TABLE location_logs ADD COLUMN altitude DOUBLE PRECISION;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'accuracy'
	) THEN
		ALTER TABLE location_logs ADD COLUMN accuracy DOUBLE PRECISION;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'speed'
	) THEN
		ALTER TABLE location_logs ADD COLUMN speed DOUBLE PRECISION;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'heading'
	) THEN
		ALTER TABLE location_logs ADD COLUMN heading DOUBLE PRECISION;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'timestamp'
	) THEN
		ALTER TABLE location_logs ADD COLUMN timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'user_id'
	) THEN
		ALTER TABLE location_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'visit_id'
	) THEN
		ALTER TABLE location_logs ADD COLUMN visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE;
	END IF;

	-- Ensure created_at exists for consistency with other tables
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'location_logs' AND column_name = 'created_at'
	) THEN
		ALTER TABLE location_logs ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
	END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_location_logs_visit_id ON location_logs(visit_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_user_id ON location_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_timestamp ON location_logs(timestamp);

-- RLS (idempotent): enable and add common policies if missing
ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'location_logs' AND policyname = 'location_logs_select_own'
	) THEN
		CREATE POLICY location_logs_select_own ON location_logs FOR SELECT USING (user_id = auth.uid());
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'location_logs' AND policyname = 'location_logs_insert_own'
	) THEN
		CREATE POLICY location_logs_insert_own ON location_logs FOR INSERT WITH CHECK (user_id = auth.uid());
	END IF;
END $$;

-- 2) REPORTS: ensure schema exists with expected columns
CREATE TABLE IF NOT EXISTS reports (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	site_visit_id UUID NOT NULL REFERENCES site_visits(id) ON DELETE CASCADE,
	notes TEXT,
	submitted_at TIMESTAMPTZ DEFAULT NOW(),
	is_synced BOOLEAN DEFAULT TRUE,
	last_modified TIMESTAMPTZ DEFAULT NOW(),
	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'reports_select_assigned'
	) THEN
		CREATE POLICY reports_select_assigned ON reports FOR SELECT USING (
			site_visit_id IN (
				SELECT id FROM site_visits WHERE assigned_to = auth.uid()
			)
		);
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'reports_insert_assigned'
	) THEN
		CREATE POLICY reports_insert_assigned ON reports FOR INSERT WITH CHECK (
			site_visit_id IN (
				SELECT id FROM site_visits WHERE assigned_to = auth.uid()
			)
		);
	END IF;
END $$;

-- 3) REPORT_PHOTOS: ensure schema aligns with app usage (photo_url, storage_path optional, caption)
CREATE TABLE IF NOT EXISTS report_photos (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
	photo_url TEXT NOT NULL,
	storage_path TEXT,
	caption TEXT,
	is_synced BOOLEAN DEFAULT TRUE,
	last_modified TIMESTAMPTZ DEFAULT NOW(),
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_photos_report_id ON report_photos(report_id);
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'report_photos' AND policyname = 'report_photos_select_assigned'
	) THEN
		CREATE POLICY report_photos_select_assigned ON report_photos FOR SELECT USING (
			report_id IN (
				SELECT id FROM reports WHERE site_visit_id IN (
					SELECT id FROM site_visits WHERE assigned_to = auth.uid()
				)
			)
		);
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE tablename = 'report_photos' AND policyname = 'report_photos_insert_assigned'
	) THEN
		CREATE POLICY report_photos_insert_assigned ON report_photos FOR INSERT WITH CHECK (
			report_id IN (
				SELECT id FROM reports WHERE site_visit_id IN (
					SELECT id FROM site_visits WHERE assigned_to = auth.uid()
				)
			)
		);
	END IF;
END $$;

-- 4) SITE_VISITS: ensure last_modified exists (used by some clients); idempotent
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'site_visits' AND column_name = 'last_modified'
	) THEN
		ALTER TABLE site_visits ADD COLUMN last_modified TIMESTAMPTZ DEFAULT NOW();
	END IF;
END $$;

-- Optional: refresh schema cache hint (Supabase handles automatically)
-- select pg_notify('pgrst', 'reload schema');

