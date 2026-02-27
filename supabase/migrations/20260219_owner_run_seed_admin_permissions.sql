-- Owner-run migration: ensure unique index + seed admin role and permissions
-- Run this as a DB owner in Supabase SQL editor.

-- 1) Create the UNIQUE index expected by INSERT ... ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_role_resource_action
  ON public.permissions (role_id, resource, action);

-- 2) Upsert the admin role (use the role_id from your JSON if you want deterministic id)
INSERT INTO public.roles (id, name, display_name, description, is_system_role, is_active, created_by)
VALUES (
  'e5ec4310-0571-4a2d-9427-4342cb41f5e1',
  'admin',
  'Administrator',
  'Full system access with all permissions',
  true,
  true,
  NULL
)
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      is_system_role = EXCLUDED.is_system_role,
      is_active = EXCLUDED.is_active;

-- 3) Insert the admin permissions (idempotent thanks to the unique index)
INSERT INTO public.permissions (role_id, resource, action, conditions)
SELECT r.id, v.resource, v.action, NULL
FROM public.roles r
JOIN (
  VALUES
    ('users','create'), ('users','read'), ('users','update'), ('users','delete'),
    ('roles','create'), ('roles','read'), ('roles','update'), ('roles','delete'),
    ('permissions','create'), ('permissions','read'), ('permissions','update'), ('permissions','delete'),
    ('projects','create'), ('projects','read'), ('projects','update'), ('projects','delete'),
    ('mmp','create'), ('mmp','read'), ('mmp','update'), ('mmp','delete'), ('mmp','approve'),
    ('site_visits','create'), ('site_visits','read'), ('site_visits','update'), ('site_visits','delete'),
    ('finances','read'), ('finances','update'), ('finances','approve'),
    ('reports','read'), ('reports','create'),
    ('settings','read'), ('settings','update')
  ) AS v(resource, action)
  ON r.name = 'admin'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- 4) Quick verification helpers (optional):
-- Check the admin role exists and list its permissions
-- SELECT * FROM public.roles WHERE name = 'admin';
-- SELECT p.* FROM public.permissions p JOIN public.roles r ON p.role_id = r.id WHERE r.name = 'admin' ORDER BY resource, action;

-- NOTE: This migration seeds the admin role + permissions only. The full role-management
-- migration file `supabase/migrations/20241004000001_role_management_system.sql` also
-- creates helper functions (get_user_permissions, get_roles_with_permissions, etc.).
-- If those functions are missing in your DB, run that migration file (owner) after this.

-- FK reattachment: foreign-key constraints must be reattached as owner as well. You can
-- either run the ALTER TABLE ... ADD CONSTRAINT block from `scripts/recreate_schema_ready.sql`
-- or request the idempotent per-constraint installer. I did not re-attach FKs here to keep
-- this migration focused and safe; run FK reattachment as a separate owner step.
