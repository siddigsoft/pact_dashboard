-- PACT Command Center - Enable Supabase Realtime for All Tables
-- Run this SQL in your Supabase SQL Editor to enable real-time updates
-- 
-- This script enables realtime subscriptions for all tables in the system
-- so that changes are automatically pushed to connected clients without
-- requiring page refresh.
--
-- IMPORTANT: Run this in your Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/[your-project-id]/sql
--
-- This script safely handles tables that are already in the publication
-- by checking before adding each table.

DO $$
DECLARE
    tables_to_add TEXT[] := ARRAY[
        -- Core User & Authentication Tables
        'profiles',
        'user_roles',
        'user_settings',
        
        -- Notification System
        'notifications',
        
        -- Wallet & Financial Tables
        'wallets',
        'wallet_transactions',
        'withdrawal_requests',
        'down_payment_requests',
        
        -- Cost Approval & Submissions
        'site_visit_cost_submissions',
        'cost_approval_history',
        
        -- MMP (Monthly Monitoring Plan) Tables
        'mmp_files',
        'mmp_site_entries',
        
        -- Site Visits
        'site_visits',
        
        -- Project Management
        'projects',
        'project_activities',
        'sub_activities',
        
        -- Budget Management
        'project_budgets',
        'mmp_budgets',
        'budget_transactions',
        'budget_alerts',
        
        -- Chat System
        'chat_participants',
        'chat_messages',
        'chat_rooms',
        
        -- Classification & Fee Structures
        'user_classifications',
        'classification_fee_structures',
        
        -- Settings
        'data_visibility_settings',
        'dashboard_settings',
        
        -- Audit & Logging
        'audit_logs',
        'deletion_audit_log',
        
        -- Super Admin
        'super_admins',
        
        -- Hubs & Geographic Management
        'hubs',
        'hub_states',
        
        -- Report Photos
        'report_photos',
        
        -- Password Reset
        'password_reset_otps',
        
        -- Site Registry
        'master_sites',
        
        -- Tasks & Assignments
        'tasks',
        'task_assignments'
    ];
    tbl_name TEXT;
    tbl_exists BOOLEAN;
    already_in_pub BOOLEAN;
    added_count INT := 0;
    skipped_count INT := 0;
    not_found_count INT := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PACT Command Center - Enabling Realtime';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    FOREACH tbl_name IN ARRAY tables_to_add
    LOOP
        -- Check if table exists (use fully qualified column reference)
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_schema = 'public' AND t.table_name = tbl_name
        ) INTO tbl_exists;
        
        IF NOT tbl_exists THEN
            RAISE NOTICE 'SKIP: Table "%" does not exist', tbl_name;
            not_found_count := not_found_count + 1;
            CONTINUE;
        END IF;
        
        -- Check if already in publication
        SELECT EXISTS (
            SELECT 1 FROM pg_publication_tables pt
            WHERE pt.pubname = 'supabase_realtime' 
            AND pt.schemaname = 'public' 
            AND pt.tablename = tbl_name
        ) INTO already_in_pub;
        
        IF already_in_pub THEN
            RAISE NOTICE 'SKIP: Table "%" already has realtime enabled', tbl_name;
            skipped_count := skipped_count + 1;
        ELSE
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl_name);
            RAISE NOTICE 'ADDED: Table "%" now has realtime enabled', tbl_name;
            added_count := added_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables added to realtime: %', added_count;
    RAISE NOTICE 'Tables already enabled: %', skipped_count;
    RAISE NOTICE 'Tables not found: %', not_found_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Real-time updates are now enabled!';
    RAISE NOTICE 'Changes will automatically sync without page refresh.';
    RAISE NOTICE '========================================';
END $$;

-- To verify which tables have realtime enabled, run:
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
