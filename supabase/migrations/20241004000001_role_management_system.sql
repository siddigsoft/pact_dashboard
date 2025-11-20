-- Role Management System Migration (Schema-Safe Version)
-- This migration enhances the existing role system with comprehensive role and permission management
-- Compatible with existing schema without breaking changes

-- Create app_role enum if it doesn't exist (safe for existing text role columns)
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM (
        'admin',
        'ict', 
        'fom',
        'financialAdmin',
        'supervisor',
        'coordinator',
        'dataCollector',
        'reviewer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create project_type enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE project_type AS ENUM (
        'infrastructure',
        'survey',
        'compliance',
        'monitoring',
        'training',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create project_status enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'draft',
        'active',
        'onHold',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create activity_status enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE activity_status AS ENUM (
        'pending',
        'inProgress',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create roles table for role definitions
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

-- Create permissions table for granular permissions
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL, -- e.g., 'users', 'projects', 'mmp', 'site_visits'
    action VARCHAR(50) NOT NULL,   -- e.g., 'create', 'read', 'update', 'delete', 'approve'
    conditions JSONB,              -- Optional conditions for conditional permissions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, resource, action)
);

-- SAFELY update user_roles table without breaking existing data
-- Keep the existing text role column and add new columns for enhanced functionality
ALTER TABLE public.user_roles 
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id),
    ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

-- Add constraint to ensure role is valid app_role (but keep as text for compatibility)
DO $$ BEGIN
    ALTER TABLE public.user_roles 
    ADD CONSTRAINT user_roles_role_check CHECK (role IN (
        'admin', 'ict', 'fom', 'financialAdmin', 'supervisor', 
        'coordinator', 'dataCollector', 'reviewer'
    ));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_role_id ON public.permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON public.permissions(resource, action);

-- Enable RLS on new tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for roles table (updated for text role compatibility)
CREATE POLICY "roles_select_all_auth" ON public.roles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "roles_modify_admin_only" ON public.roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'ict')
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'ict')
        )
    );

-- RLS policies for permissions table (updated for text role compatibility)
CREATE POLICY "permissions_select_all_auth" ON public.permissions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "permissions_modify_admin_only" ON public.permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'ict')
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role IN ('admin', 'ict')
        )
    );

-- Function to get user permissions (updated to work with text role column)
CREATE OR REPLACE FUNCTION public.get_user_permissions(user_uuid UUID)
RETURNS TABLE(resource VARCHAR, action VARCHAR, conditions JSONB)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT DISTINCT p.resource, p.action, p.conditions
    FROM public.permissions p
    JOIN public.user_roles ur ON (
        (ur.role = (SELECT name FROM public.roles WHERE id = p.role_id))
        OR ur.role_id = p.role_id
    )
    WHERE ur.user_id = user_uuid
    AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id = p.role_id AND r.is_active = true);
$$;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.user_has_permission(
    user_uuid UUID,
    check_resource VARCHAR,
    check_action VARCHAR
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.get_user_permissions(user_uuid) p
        WHERE p.resource = check_resource
        AND p.action = check_action
    );
$$;

-- Function to get all roles with their permissions
CREATE OR REPLACE FUNCTION public.get_roles_with_permissions()
RETURNS TABLE(
    role_id UUID,
    role_name VARCHAR,
    display_name VARCHAR,
    description TEXT,
    is_system_role BOOLEAN,
    is_active BOOLEAN,
    permissions JSONB
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        r.id,
        r.name,
        r.display_name,
        r.description,
        r.is_system_role,
        r.is_active,
        COALESCE(
            json_agg(
                json_build_object(
                    'resource', p.resource,
                    'action', p.action,
                    'conditions', p.conditions
                )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
        ) as permissions
    FROM public.roles r
    LEFT JOIN public.permissions p ON r.id = p.role_id
    WHERE r.is_active = true
    GROUP BY r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active
    ORDER BY r.is_system_role DESC, r.name;
$$;

-- Insert default system roles
INSERT INTO public.roles (name, display_name, description, is_system_role, created_by) VALUES
('admin', 'Administrator', 'Full system access with all permissions', true, NULL),
('ict', 'ICT Staff', 'Information and Communication Technology staff with technical permissions', true, NULL),
('fom', 'Field Operations Manager', 'Manages field operations and site visits', true, NULL),
('financialAdmin', 'Financial Administrator', 'Manages financial operations and budgets', true, NULL),
('supervisor', 'Supervisor', 'Supervises field activities and reviews submissions', true, NULL),
('coordinator', 'Coordinator', 'Coordinates field activities and assignments', true, NULL),
('dataCollector', 'Data Collector', 'Collects and submits field data', true, NULL),
('reviewer', 'Reviewer', 'Reviews and validates submitted data', true, NULL)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions for system roles
-- Admin permissions (full access)
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('users', 'create'), ('users', 'read'), ('users', 'update'), ('users', 'delete'),
    ('roles', 'create'), ('roles', 'read'), ('roles', 'update'), ('roles', 'delete'),
    ('permissions', 'create'), ('permissions', 'read'), ('permissions', 'update'), ('permissions', 'delete'),
    ('projects', 'create'), ('projects', 'read'), ('projects', 'update'), ('projects', 'delete'),
    ('mmp', 'create'), ('mmp', 'read'), ('mmp', 'update'), ('mmp', 'delete'), ('mmp', 'approve'),
    ('site_visits', 'create'), ('site_visits', 'read'), ('site_visits', 'update'), ('site_visits', 'delete'),
    ('finances', 'read'), ('finances', 'update'), ('finances', 'approve'),
    ('reports', 'read'), ('reports', 'create'),
    ('settings', 'read'), ('settings', 'update')
) AS perms(resource, action)
WHERE r.name = 'admin'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ICT permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('users', 'create'), ('users', 'read'), ('users', 'update'),
    ('roles', 'create'), ('roles', 'read'), ('roles', 'update'),
    ('permissions', 'read'), ('permissions', 'update'),
    ('projects', 'create'), ('projects', 'read'), ('projects', 'update'),
    ('mmp', 'create'), ('mmp', 'read'), ('mmp', 'update'), ('mmp', 'approve'),
    ('site_visits', 'create'), ('site_visits', 'read'), ('site_visits', 'update'),
    ('finances', 'read'),
    ('reports', 'read'), ('reports', 'create'),
    ('settings', 'read'), ('settings', 'update')
) AS perms(resource, action)
WHERE r.name = 'ict'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- FOM permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('projects', 'read'), ('projects', 'update'),
    ('mmp', 'create'), ('mmp', 'read'), ('mmp', 'update'), ('mmp', 'approve'),
    ('site_visits', 'create'), ('site_visits', 'read'), ('site_visits', 'update'),
    ('finances', 'read'),
    ('reports', 'read')
) AS perms(resource, action)
WHERE r.name = 'fom'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Financial Admin permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('site_visits', 'read'),
    ('finances', 'read'), ('finances', 'update'), ('finances', 'approve'),
    ('reports', 'read')
) AS perms(resource, action)
WHERE r.name = 'financialAdmin'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Supervisor permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('mmp', 'read'), ('mmp', 'update'),
    ('site_visits', 'read'), ('site_visits', 'update'),
    ('reports', 'read')
) AS perms(resource, action)
WHERE r.name = 'supervisor'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Coordinator permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('site_visits', 'read'), ('site_visits', 'update'),
    ('reports', 'read')
) AS perms(resource, action)
WHERE r.name = 'coordinator'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Data Collector permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('site_visits', 'read'), ('site_visits', 'update'),
    ('mmp', 'read')
) AS perms(resource, action)
WHERE r.name = 'dataCollector'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Reviewer permissions
INSERT INTO public.permissions (role_id, resource, action) 
SELECT r.id, resource, action FROM public.roles r,
(VALUES 
    ('site_visits', 'read'),
    ('mmp', 'read')
) AS perms(resource, action)
WHERE r.name = 'reviewer'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Create updated_at trigger for roles table
CREATE OR REPLACE FUNCTION public.set_roles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_roles_updated_at ON public.roles;
CREATE TRIGGER set_roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_roles_updated_at();