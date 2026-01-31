-- Add is_template and source_signature_id columns to digital_signatures table
-- This migration adds explicit template tracking for better filtering and sync between tables

-- Add is_template column for explicit template identification
ALTER TABLE digital_signatures 
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;

-- Add source_signature_id to link back to user_signatures for sync operations
ALTER TABLE digital_signatures 
ADD COLUMN IF NOT EXISTS source_signature_id UUID;

-- Create index for faster template filtering
CREATE INDEX IF NOT EXISTS idx_digital_signatures_is_template 
ON digital_signatures(is_template) 
WHERE is_template = TRUE;

-- Create index for source signature lookup (for deletion sync)
CREATE INDEX IF NOT EXISTS idx_digital_signatures_source_signature_id 
ON digital_signatures(source_signature_id) 
WHERE source_signature_id IS NOT NULL;

-- Update existing mobile templates (those with "(Template)" in document_name)
-- to have is_template = true
UPDATE digital_signatures 
SET is_template = TRUE 
WHERE document_name LIKE '%(Template)%' 
  AND is_template IS NOT TRUE;

-- Backfill source_signature_id for existing templates by matching user_id and signature_data
-- This links legacy templates to their source user_signatures for proper sync
UPDATE digital_signatures ds
SET source_signature_id = us.id
FROM user_signatures us
WHERE ds.user_id = us.user_id
  AND ds.signature_data = us.signature_data
  AND ds.is_template = TRUE
  AND ds.source_signature_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN digital_signatures.is_template IS 'True if this is a mobile signature template, false for actual document signatures';
COMMENT ON COLUMN digital_signatures.source_signature_id IS 'Links to user_signatures.id for sync operations (backfill, delete)';
