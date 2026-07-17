-- Ensure equipment table has user_id column for tracking who created/modified equipment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='user_id'
    ) THEN
        ALTER TABLE equipment ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        CREATE INDEX idx_equipment_user_id ON equipment(user_id);
        COMMENT ON COLUMN equipment.user_id IS 'User who created or last modified this equipment record';
    END IF;
END $$;

-- Ensure equipment has last_modified column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='last_modified'
    ) THEN
        ALTER TABLE equipment ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        COMMENT ON COLUMN equipment.last_modified IS 'Timestamp of last modification';
    END IF;
END $$;

-- Ensure equipment has created_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='equipment' AND column_name='created_at'
    ) THEN
        ALTER TABLE equipment ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        COMMENT ON COLUMN equipment.created_at IS 'Timestamp when record was created';
    END IF;
END $$;

-- Ensure site_visits has last_modified column for tracking changes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='site_visits' AND column_name='last_modified'
    ) THEN
        ALTER TABLE site_visits ADD COLUMN last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        COMMENT ON COLUMN site_visits.last_modified IS 'Timestamp of last status or data modification';
    END IF;
END $$;

-- Create a trigger to auto-update last_modified for equipment
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

-- Create a trigger to auto-update last_modified for site_visits
CREATE OR REPLACE FUNCTION update_site_visits_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_visits_last_modified_trigger ON site_visits;
CREATE TRIGGER site_visits_last_modified_trigger
    BEFORE UPDATE ON site_visits
    FOR EACH ROW
    EXECUTE FUNCTION update_site_visits_last_modified();

-- Update RLS policies for equipment if not already present
DO $$
BEGIN
    -- Check if policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'equipment' 
        AND policyname = 'Users can view all equipment'
    ) THEN
        CREATE POLICY "Users can view all equipment"
            ON equipment FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'equipment' 
        AND policyname = 'Users can insert equipment'
    ) THEN
        CREATE POLICY "Users can insert equipment"
            ON equipment FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'equipment' 
        AND policyname = 'Users can update equipment'
    ) THEN
        CREATE POLICY "Users can update equipment"
            ON equipment FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Ensure equipment table has RLS enabled
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE equipment IS 'Equipment inventory and inspection records';
