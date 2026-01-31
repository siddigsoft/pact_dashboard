-- Create digital_signatures table for admin visibility of mobile signatures
-- This table stores synced signatures from mobile app for web admin management

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS digital_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    signature_type TEXT NOT NULL DEFAULT 'drawn',
    signature_data TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    document_name TEXT,
    device_info TEXT,
    is_template BOOLEAN DEFAULT FALSE,
    source_signature_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_digital_signatures_user_id 
ON digital_signatures(user_id);

CREATE INDEX IF NOT EXISTS idx_digital_signatures_verification_status 
ON digital_signatures(verification_status);

CREATE INDEX IF NOT EXISTS idx_digital_signatures_is_template 
ON digital_signatures(is_template) 
WHERE is_template = TRUE;

CREATE INDEX IF NOT EXISTS idx_digital_signatures_source_signature_id 
ON digital_signatures(source_signature_id) 
WHERE source_signature_id IS NOT NULL;

-- Enable RLS
ALTER TABLE digital_signatures ENABLE ROW LEVEL SECURITY;

-- RLS policies for digital_signatures
CREATE POLICY IF NOT EXISTS "Users can view own signatures" 
ON digital_signatures FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own signatures" 
ON digital_signatures FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own signatures" 
ON digital_signatures FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own signatures" 
ON digital_signatures FOR DELETE 
USING (auth.uid() = user_id);

-- Admin policy - admins can view all signatures
CREATE POLICY IF NOT EXISTS "Admins can view all signatures" 
ON digital_signatures FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
        AND r.name IN ('admin', 'super_admin')
    )
);

-- Admin policy - admins can update all signatures (for verification)
CREATE POLICY IF NOT EXISTS "Admins can update all signatures" 
ON digital_signatures FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
        AND r.name IN ('admin', 'super_admin')
    )
);

-- Add comments for documentation
COMMENT ON TABLE digital_signatures IS 'Stores digital signatures synced from mobile app for admin management and verification';
COMMENT ON COLUMN digital_signatures.is_template IS 'True if this is a mobile signature template, false for actual document signatures';
COMMENT ON COLUMN digital_signatures.source_signature_id IS 'Links to user_signatures.id for sync operations (backfill, delete)';
