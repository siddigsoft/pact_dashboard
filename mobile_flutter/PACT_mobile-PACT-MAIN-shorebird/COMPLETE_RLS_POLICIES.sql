-- Drop existing policies for all tables
DROP POLICY IF EXISTS "Allow select mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Allow insert mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Allow update mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Allow delete mmp_site_entries for authenticated" ON public.mmp_site_entries;

DROP POLICY IF EXISTS "Allow select site_locations for authenticated" ON public.site_locations;
DROP POLICY IF EXISTS "Allow insert site_locations for authenticated" ON public.site_locations;
DROP POLICY IF EXISTS "Allow update site_locations for authenticated" ON public.site_locations;
DROP POLICY IF EXISTS "Allow delete site_locations for authenticated" ON public.site_locations;

DROP POLICY IF EXISTS "Allow select location_logs for authenticated" ON public.location_logs;
DROP POLICY IF EXISTS "Allow insert location_logs for authenticated" ON public.location_logs;
DROP POLICY IF EXISTS "Allow update location_logs for authenticated" ON public.location_logs;
DROP POLICY IF EXISTS "Allow delete location_logs for authenticated" ON public.location_logs;

DROP POLICY IF EXISTS "Allow select reports for authenticated" ON public.reports;
DROP POLICY IF EXISTS "Allow insert reports for authenticated" ON public.reports;
DROP POLICY IF EXISTS "Allow update reports for authenticated" ON public.reports;
DROP POLICY IF EXISTS "Allow delete reports for authenticated" ON public.reports;

DROP POLICY IF EXISTS "Allow select report_photos for authenticated" ON public.report_photos;
DROP POLICY IF EXISTS "Allow insert report_photos for authenticated" ON public.report_photos;
DROP POLICY IF EXISTS "Allow update report_photos for authenticated" ON public.report_photos;
DROP POLICY IF EXISTS "Allow delete report_photos for authenticated" ON public.report_photos;

-- ==================== mmp_site_entries ====================
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select mmp_site_entries for authenticated" 
  ON public.mmp_site_entries 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert mmp_site_entries for authenticated" 
  ON public.mmp_site_entries 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update mmp_site_entries for authenticated" 
  ON public.mmp_site_entries 
  FOR UPDATE 
  USING (auth.uid() = accepted_by::uuid OR accepted_by IS NULL)
  WITH CHECK (auth.uid() = accepted_by::uuid);

CREATE POLICY "Allow delete mmp_site_entries for authenticated" 
  ON public.mmp_site_entries 
  FOR DELETE 
  USING (auth.uid() = accepted_by::uuid OR accepted_by IS NULL);

-- ==================== site_locations ====================
-- Stores exact site location captured when "Start Visit" is tapped
ALTER TABLE public.site_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select site_locations for authenticated" 
  ON public.site_locations 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert site_locations for authenticated" 
  ON public.site_locations 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id::uuid);

CREATE POLICY "Allow update site_locations for authenticated" 
  ON public.site_locations 
  FOR UPDATE 
  USING (auth.uid() = user_id::uuid)
  WITH CHECK (auth.uid() = user_id::uuid);

CREATE POLICY "Allow delete site_locations for authenticated" 
  ON public.site_locations 
  FOR DELETE 
  USING (auth.uid() = user_id::uuid);

-- ==================== location_logs ====================
-- Stores continuous location tracking during visits (multiple entries per visit)
ALTER TABLE public.location_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select location_logs for authenticated" 
  ON public.location_logs 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert location_logs for authenticated" 
  ON public.location_logs 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id::uuid);

CREATE POLICY "Allow update location_logs for authenticated" 
  ON public.location_logs 
  FOR UPDATE 
  USING (auth.uid() = user_id::uuid)
  WITH CHECK (auth.uid() = user_id::uuid);

CREATE POLICY "Allow delete location_logs for authenticated" 
  ON public.location_logs 
  FOR DELETE 
  USING (auth.uid() = user_id::uuid);

-- ==================== reports ====================
-- Stores visit reports submitted after visit completion
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select reports for authenticated" 
  ON public.reports 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert reports for authenticated" 
  ON public.reports 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update reports for authenticated" 
  ON public.reports 
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow delete reports for authenticated" 
  ON public.reports 
  FOR DELETE 
  USING (auth.role() = 'authenticated');

-- ==================== report_photos ====================
-- Stores photos attached to reports
ALTER TABLE public.report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select report_photos for authenticated" 
  ON public.report_photos 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert report_photos for authenticated" 
  ON public.report_photos 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update report_photos for authenticated" 
  ON public.report_photos 
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow delete report_photos for authenticated" 
  ON public.report_photos 
  FOR DELETE 
  USING (auth.role() = 'authenticated');
