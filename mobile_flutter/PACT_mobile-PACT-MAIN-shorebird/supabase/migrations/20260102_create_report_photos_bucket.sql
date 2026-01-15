-- Create storage bucket for site visit report photos
-- This is required for CompleteVisitScreen photo uploads.

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-photos', 'report-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Basic storage policies for authenticated users
-- Adjust these to match your security model.

DROP POLICY IF EXISTS "Allow authenticated read report-photos" ON storage.objects;
CREATE POLICY "Allow authenticated read report-photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "Allow authenticated upload report-photos" ON storage.objects;
CREATE POLICY "Allow authenticated upload report-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "Allow authenticated update report-photos" ON storage.objects;
CREATE POLICY "Allow authenticated update report-photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'report-photos')
  WITH CHECK (bucket_id = 'report-photos');
