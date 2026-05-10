-- ============================================================================
-- STAFF CONTRACT DOCUMENTS
-- ============================================================================
-- Stores metadata for uploaded contract files (PDF, DOCX, etc.)
-- Actual files live in the Supabase Storage bucket "staff-contracts"
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.staff_contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  file_path      text NOT NULL,           -- storage path: profile_id/timestamp_filename
  file_size      bigint,                  -- bytes
  file_type      text,                    -- MIME type
  notes          text,
  uploaded_by    uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_contracts_profile ON public.staff_contracts(profile_id);

-- 2. RLS
ALTER TABLE public.staff_contracts ENABLE ROW LEVEL SECURITY;

-- Admins / super_admin / ICT can do everything
CREATE POLICY "staff_contracts_admin_all"
ON public.staff_contracts FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin', 'ict')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin', 'ict')
  )
);

-- Everyone authenticated can read (view contracts for their own profile or if admin)
CREATE POLICY "staff_contracts_select_auth"
ON public.staff_contracts FOR SELECT
TO authenticated
USING (true);

-- 3. Storage bucket (private — signed URLs required)
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-contracts', 'staff-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "staff_contracts_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "staff_contracts_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "staff_contracts_storage_delete" ON storage.objects;

CREATE POLICY "staff_contracts_storage_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'staff-contracts');

CREATE POLICY "staff_contracts_storage_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'staff-contracts');

CREATE POLICY "staff_contracts_storage_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'staff-contracts');
