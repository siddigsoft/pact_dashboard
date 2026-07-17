-- Create cost_attachments table for storing receipt and supporting documents
-- This replaces reliance on URLs and provides secure, reliable document storage

CREATE TABLE IF NOT EXISTS public.cost_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cost_id uuid NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  attachment_type TEXT DEFAULT 'receipt', -- 'receipt', 'invoice', 'photo', 'other'
  bucket_path TEXT NOT NULL, -- Path in Supabase Storage (e.g., 'cost-receipts/cost_id/filename')
  uploaded_by uuid NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_primary BOOLEAN DEFAULT false, -- Main receipt if multiple attachments
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT cost_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT cost_attachments_cost_id_fkey FOREIGN KEY (cost_id) 
    REFERENCES operational_cost_submissions(id) ON DELETE CASCADE,
  CONSTRAINT cost_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_cost_attachments_cost_id 
  ON public.cost_attachments(cost_id);

CREATE INDEX IF NOT EXISTS idx_cost_attachments_uploaded_by 
  ON public.cost_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_cost_attachments_is_primary 
  ON public.cost_attachments(is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_cost_attachments_created_at 
  ON public.cost_attachments(created_at);

-- Create policy for RLS (Row Level Security)
ALTER TABLE public.cost_attachments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view attachments for their own cost submissions
CREATE POLICY "Users can view their cost attachments" ON public.cost_attachments
  FOR SELECT USING (
    uploaded_by = auth.uid() OR
    cost_id IN (
      SELECT id FROM operational_cost_submissions 
      WHERE submitted_by = auth.uid()
    )
  );

-- Policy: Users can upload attachments for their own costs
CREATE POLICY "Users can upload cost attachments" ON public.cost_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid() AND
    cost_id IN (
      SELECT id FROM operational_cost_submissions 
      WHERE submitted_by = auth.uid()
    )
  );

-- Policy: Users can only delete their own attachments
CREATE POLICY "Users can delete their cost attachments" ON public.cost_attachments
  FOR DELETE USING (uploaded_by = auth.uid());

-- Create storage bucket for cost receipts if it doesn't exist
-- (This should be run separately in Supabase Storage)
-- Bucket name: "cost-receipts"
-- Public: false (private by default)

-- Add comment to table
COMMENT ON TABLE public.cost_attachments IS 'Stores receipt and supporting documents for operational cost submissions. Replaces URL-based receipts with secure file storage.';

COMMENT ON COLUMN public.cost_attachments.attachment_type IS 'Type of document: receipt, invoice, photo, or other';
COMMENT ON COLUMN public.cost_attachments.is_primary IS 'Marks the main receipt document if multiple attachments exist';
COMMENT ON COLUMN public.cost_attachments.bucket_path IS 'Path in Supabase Storage for retrieving the file';
