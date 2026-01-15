-- Drop existing policies
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

-- Enable RLS on mmp_site_entries
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;

-- Create policies for mmp_site_entries
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

-- Enable RLS on site_locations
ALTER TABLE public.site_locations ENABLE ROW LEVEL SECURITY;

-- Create policies for site_locations
-- This table stores the exact location where the site was when "Start Visit" was tapped
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

-- Enable RLS on location_logs
-- This table stores continuous location tracking during the visit (multiple entries per visit)
ALTER TABLE public.location_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for location_logs
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
