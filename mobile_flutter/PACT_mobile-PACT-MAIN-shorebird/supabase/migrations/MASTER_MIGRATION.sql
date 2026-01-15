-- ============================================================================
-- PACT MOBILE - MASTER MIGRATION SCRIPT
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor to apply all migrations
-- This is safe to run multiple times (idempotent)
-- ============================================================================

BEGIN;

-- ============================================================================
-- MIGRATION 1: Enhanced Registration Fields
-- File: 20240116_enhanced_registration_fields.sql
-- ============================================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS hub_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS state_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_profiles_hub_id ON profiles(hub_id);
CREATE INDEX IF NOT EXISTS idx_profiles_state_id ON profiles(state_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(employee_id);

-- ============================================================================
-- MIGRATION 2: Chat System Foundation
-- File: 20240115_chat_contacts_and_comprehensive_safety.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    custom_name TEXT,
    default_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, contact_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_contacts_user_id ON chat_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_contact_user_id ON chat_contacts(contact_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_chat_id ON chat_contacts(chat_id);

ALTER TABLE chat_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_contacts' AND policyname = 'Users can view their own contacts'
    ) THEN
        CREATE POLICY "Users can view their own contacts"
            ON chat_contacts FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_contacts' AND policyname = 'Users can insert their own contacts'
    ) THEN
        CREATE POLICY "Users can insert their own contacts"
            ON chat_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_contacts' AND policyname = 'Users can update their own contacts'
    ) THEN
        CREATE POLICY "Users can update their own contacts"
            ON chat_contacts FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_contacts' AND policyname = 'Users can delete their own contacts'
    ) THEN
        CREATE POLICY "Users can delete their own contacts"
            ON chat_contacts FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 3: Chat Messages
-- File: 20240117_fix_chat_participants.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON chat_messages(sent_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_messages' AND policyname = 'Users can view messages in their chats'
    ) THEN
        CREATE POLICY "Users can view messages in their chats"
            ON chat_messages FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM chat_contacts
                    WHERE chat_contacts.chat_id = chat_messages.chat_id
                    AND chat_contacts.user_id = auth.uid()
                )
                OR sender_id = auth.uid()
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_messages' AND policyname = 'Users can insert messages to their chats'
    ) THEN
        CREATE POLICY "Users can insert messages to their chats"
            ON chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid());
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 4: Location Logs
-- File: 20240118_create_location_logs_table.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_logs_visit_id ON location_logs(visit_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_user_id ON location_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_timestamp ON location_logs(timestamp);

ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'location_logs' AND policyname = 'Users can view their own location logs'
    ) THEN
        CREATE POLICY "Users can view their own location logs"
            ON location_logs FOR SELECT USING (user_id = auth.uid());
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'location_logs' AND policyname = 'Users can insert their own location logs'
    ) THEN
        CREATE POLICY "Users can insert their own location logs"
            ON location_logs FOR INSERT WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 5: Reports and Photos
-- File: 20240118_create_reports_tables.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_site_visit_id ON reports(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_reports_submitted_at ON reports(submitted_at);
CREATE INDEX IF NOT EXISTS idx_report_photos_report_id ON report_photos(report_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'reports' AND policyname = 'Users can view reports for their assigned visits'
    ) THEN
        CREATE POLICY "Users can view reports for their assigned visits"
            ON reports FOR SELECT
            USING (
                site_visit_id IN (
                    SELECT id FROM site_visits WHERE assigned_to = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'reports' AND policyname = 'Users can create reports for their assigned visits'
    ) THEN
        CREATE POLICY "Users can create reports for their assigned visits"
            ON reports FOR INSERT
            WITH CHECK (
                site_visit_id IN (
                    SELECT id FROM site_visits WHERE assigned_to = auth.uid()
                )
            );
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 6: Equipment and Site Visits Enhancements
-- File: 20240118_update_equipment_and_visits_columns.sql
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='user_id'
    ) THEN
        ALTER TABLE equipment ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        CREATE INDEX idx_equipment_user_id ON equipment(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='last_modified'
    ) THEN
        ALTER TABLE equipment ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='site_visits' AND column_name='last_modified'
    ) THEN
        ALTER TABLE site_visits ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION update_equipment_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equipment_last_modified_trigger ON equipment;
CREATE TRIGGER equipment_last_modified_trigger
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_equipment_last_modified();

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION 7: Comprehensive Monitoring Checklists
-- File: 20240119_comprehensive_monitoring_checklists.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS comprehensive_monitoring_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enumerator_name TEXT NOT NULL,
    enumerator_phone TEXT,
    gps_coordinates TEXT,
    district TEXT NOT NULL,
    sub_county TEXT NOT NULL,
    parish TEXT NOT NULL,
    village TEXT NOT NULL,
    site_code TEXT NOT NULL,
    visit_date TIMESTAMP WITH TIME ZONE NOT NULL,
    activity_am BOOLEAN DEFAULT FALSE,
    activity_dm BOOLEAN DEFAULT FALSE,
    activity_pdm BOOLEAN DEFAULT FALSE,
    activity_phl BOOLEAN DEFAULT FALSE,
    activity_mdm BOOLEAN DEFAULT FALSE,
    am_responses JSONB DEFAULT '{}',
    dm_responses JSONB DEFAULT '{}',
    pdm_responses JSONB DEFAULT '{}',
    phl_responses JSONB DEFAULT '{}',
    mdm_responses JSONB DEFAULT '{}',
    photo_urls TEXT[] DEFAULT '{}',
    is_synced BOOLEAN DEFAULT TRUE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_user_id ON comprehensive_monitoring_checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_visit_date ON comprehensive_monitoring_checklists(visit_date);
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_district ON comprehensive_monitoring_checklists(district);

ALTER TABLE comprehensive_monitoring_checklists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'comprehensive_monitoring_checklists' 
        AND policyname = 'Users can view their own monitoring forms'
    ) THEN
        CREATE POLICY "Users can view their own monitoring forms"
            ON comprehensive_monitoring_checklists FOR SELECT
            USING (user_id = auth.uid());
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'comprehensive_monitoring_checklists' 
        AND policyname = 'Users can insert their own monitoring forms'
    ) THEN
        CREATE POLICY "Users can insert their own monitoring forms"
            ON comprehensive_monitoring_checklists FOR INSERT
            WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('monitoring_photos', 'monitoring_photos', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ All migrations applied successfully!';
    RAISE NOTICE 'Run verification queries to confirm setup.';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run separately after commit)
-- ============================================================================

-- Uncomment and run these separately to verify:

-- SELECT 'profiles columns' as check_type, column_name 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name IN ('phone', 'employee_id', 'hub_id');

-- SELECT 'tables created' as check_type, table_name 
-- FROM information_schema.tables 
-- WHERE table_name IN ('chat_contacts', 'chat_messages', 'location_logs', 'reports', 'comprehensive_monitoring_checklists');

-- SELECT 'storage buckets' as check_type, name 
-- FROM storage.buckets 
-- WHERE name = 'monitoring_photos';
