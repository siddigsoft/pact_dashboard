-- Migration: Create ad-hoc MMP tables
-- Date: 2026-04-29
-- Description: Tables for ad-hoc MMP file uploads and site entries

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: ad_hoc_mmp_files
-- Stores uploaded MMP files with metadata
CREATE TABLE IF NOT EXISTS ad_hoc_mmp_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN ('pending', 'processing', 'completed', 'failed')),
    month DATE NOT NULL,
    state TEXT NOT NULL,
    locality TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Index for user_id lookups
CREATE INDEX idx_ad_hoc_mmp_files_user_id ON ad_hoc_mmp_files(user_id);

-- Index for month lookups
CREATE INDEX idx_ad_hoc_mmp_files_month ON ad_hoc_mmp_files(month);

-- Index for state lookups
CREATE INDEX idx_ad_hoc_mmp_files_state ON ad_hoc_mmp_files(state);

-- Index for upload_status
CREATE INDEX idx_ad_hoc_mmp_files_status ON ad_hoc_mmp_files(upload_status);

-- Enable Row Level Security
ALTER TABLE ad_hoc_mmp_files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own uploads
CREATE POLICY "Users can view their own MMP files" ON ad_hoc_mmp_files
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own uploads
CREATE POLICY "Users can upload MMP files" ON ad_hoc_mmp_files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own uploads
CREATE POLICY "Users can update their own MMP files" ON ad_hoc_mmp_files
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can soft-delete their own uploads
CREATE POLICY "Users can soft-delete their own MMP files" ON ad_hoc_mmp_files
    FOR DELETE USING (auth.uid() = user_id);


-- Table: ad_hoc_mmp_site_entries
-- Stores individual site visit entries for ad-hoc MMPs
CREATE TABLE IF NOT EXISTS ad_hoc_mmp_site_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mmp_file_id UUID REFERENCES ad_hoc_mmp_files(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    state TEXT NOT NULL,
    locality TEXT NOT NULL,
    site_name TEXT NOT NULL,
    site_code TEXT,
    transport_fee NUMERIC(10, 2) DEFAULT 0,
    enumerator_fee NUMERIC(10, 2) DEFAULT 0,
    assign_to UUID REFERENCES auth.users(id),
    due_date DATE,
    status TEXT DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'assigned', 'claimed', 'completed', 'verified')),
    verification_notes TEXT,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Index for mmp_file_id lookups
CREATE INDEX idx_site_entries_mmp_file_id ON ad_hoc_mmp_site_entries(mmp_file_id);

-- Index for user_id lookups
CREATE INDEX idx_site_entries_user_id ON ad_hoc_mmp_site_entries(user_id);

-- Index for status lookups
CREATE INDEX idx_site_entries_status ON ad_hoc_mmp_site_entries(status);

-- Index for state lookups
CREATE INDEX idx_site_entries_state ON ad_hoc_mmp_site_entries(state);

-- Index for assign_to lookups
CREATE INDEX idx_site_entries_assign_to ON ad_hoc_mmp_site_entries(assign_to);

-- Enable Row Level Security
ALTER TABLE ad_hoc_mmp_site_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own site entries
CREATE POLICY "Users can view their own site entries" ON ad_hoc_mmp_site_entries
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create site entries
CREATE POLICY "Users can create site entries" ON ad_hoc_mmp_site_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own site entries
CREATE POLICY "Users can update their own site entries" ON ad_hoc_mmp_site_entries
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can soft-delete their own site entries
CREATE POLICY "Users can soft-delete their own site entries" ON ad_hoc_mmp_site_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for ad_hoc_mmp_files
CREATE TRIGGER update_ad_hoc_mmp_files_updated_at
    BEFORE UPDATE ON ad_hoc_mmp_files
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- Add trigger for ad_hoc_mmp_site_entries
CREATE TRIGGER update_ad_hoc_mmp_site_entries_updated_at
    BEFORE UPDATE ON ad_hoc_mmp_site_entries
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- Comments
COMMENT ON TABLE ad_hoc_mmp_files IS 'Stores uploaded ad-hoc MMP files with metadata';
COMMENT ON TABLE ad_hoc_mmp_site_entries IS 'Stores individual site visit entries for ad-hoc MMPs';