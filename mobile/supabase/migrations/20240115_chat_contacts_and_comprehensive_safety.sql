-- Create chat_contacts table for custom contact names
CREATE TABLE IF NOT EXISTS chat_contacts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    custom_name TEXT,
    default_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, contact_user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_contacts_user_id ON chat_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_contact_user_id ON chat_contacts(contact_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_chat_id ON chat_contacts(chat_id);

-- Enable RLS
ALTER TABLE chat_contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_contacts
CREATE POLICY "Users can view their own contacts"
    ON chat_contacts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts"
    ON chat_contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts"
    ON chat_contacts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts"
    ON chat_contacts FOR DELETE
    USING (auth.uid() = user_id);

-- Create comprehensive_safety_checklists table
CREATE TABLE IF NOT EXISTS comprehensive_safety_checklists (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Enumerator Details
    enumerator_name TEXT,
    enumerator_contact TEXT,
    team_leader_name TEXT,
    
    -- Site Information
    location_hub TEXT,
    site_name_id TEXT,
    visit_date DATE,
    visit_time TIME,
    activities_monitored TEXT[], -- Array of activity types: AM, DM, PDM, PHL, MDM
    
    -- Activity Monitoring (AM) - Questions and priorities
    am_data JSONB DEFAULT '{}', -- Stores questions, answers, and priorities
    am_photos TEXT[], -- Array of photo URLs
    
    -- Distribution Monitoring (DM)
    dm_data JSONB DEFAULT '{}', -- Stores questions and answers
    dm_photos TEXT[],
    
    -- Post-Distribution Monitoring (PDM)
    pdm_data JSONB DEFAULT '{}',
    pdm_photos TEXT[],
    
    -- Post-Harvest Loss (PHL)
    phl_data JSONB DEFAULT '{}',
    phl_photos TEXT[],
    
    -- Market Diversion Monitoring (MDM)
    mdm_data JSONB DEFAULT '{}',
    mdm_photos TEXT[],
    
    -- Sync tracking
    is_synced BOOLEAN DEFAULT FALSE,
    last_synced TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for comprehensive_safety_checklists
CREATE INDEX IF NOT EXISTS idx_comprehensive_safety_user_id ON comprehensive_safety_checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_comprehensive_safety_visit_date ON comprehensive_safety_checklists(visit_date);
CREATE INDEX IF NOT EXISTS idx_comprehensive_safety_created_at ON comprehensive_safety_checklists(created_at);

-- Enable RLS
ALTER TABLE comprehensive_safety_checklists ENABLE ROW LEVEL SECURITY;

-- Create policies for comprehensive_safety_checklists
CREATE POLICY "Users can view their own checklists"
    ON comprehensive_safety_checklists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own checklists"
    ON comprehensive_safety_checklists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checklists"
    ON comprehensive_safety_checklists FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own checklists"
    ON comprehensive_safety_checklists FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for comprehensive_safety_checklists
DROP TRIGGER IF EXISTS update_comprehensive_safety_checklists_updated_at ON comprehensive_safety_checklists;
CREATE TRIGGER update_comprehensive_safety_checklists_updated_at
    BEFORE UPDATE ON comprehensive_safety_checklists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for chat_contacts
DROP TRIGGER IF EXISTS update_chat_contacts_updated_at ON chat_contacts;
CREATE TRIGGER update_chat_contacts_updated_at
    BEFORE UPDATE ON chat_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
