-- Receipts and supporting documents uploaded by the Pre-Fund Registry use the
-- attachments bucket. Keep this bucket public because historical receipt_url
-- values store public URLs and the Funding History view must be able to render
-- those URLs inline.

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = true;

DROP POLICY IF EXISTS "pre_fund_attachments_insert_auth" ON storage.objects;
CREATE POLICY "pre_fund_attachments_insert_auth"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (
      name LIKE 'pre-fund-topups/%'
      OR name LIKE 'pre-fund-receipts/%'
    )
  );

DROP POLICY IF EXISTS "pre_fund_attachments_select_auth" ON storage.objects;
CREATE POLICY "pre_fund_attachments_select_auth"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      name LIKE 'pre-fund-topups/%'
      OR name LIKE 'pre-fund-receipts/%'
    )
  );