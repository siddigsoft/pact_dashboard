-- =============================================================================
-- Seed 5 Missing System Roles
-- Roles defined in DEFAULT_ROLE_PERMISSIONS (types/roles.ts) but absent from DB:
--   countryDirector, projectManager, seniorOperationsLead, dataTeam, auditor
--
-- APPLY: Run this SQL in the Supabase SQL editor.
-- Safe to re-run — all inserts use ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── 0. Expand action + resource constraints to match full system usage ────────
-- The original constraint only allowed 6-9 actions and 14 resources.
-- We expand both to cover every value used in DEFAULT_ROLE_PERMISSIONS.

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_action_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_action_check
  CHECK (action = ANY (ARRAY[
    'create','read','update','delete',
    'approve','assign','archive','restore','override',
    'export','submit'
  ]::text[]));

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_resource_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_resource_check
  CHECK (resource = ANY (ARRAY[
    'users','roles','permissions','settings','system','super_admins','audit_logs',
    'projects','portfolio','analytics','mmp','site_visits','hub_operations',
    'coverage_map','safety','incidents','equipment',
    'finances','cost_submissions','wallets','down_payments','pre_funding',
    'accounting','fixed_assets','procurement','transactions','signatures',
    'reports','crm','surveys','tasks','notifications','calendar',
    'hr','hr_analytics','payroll','benefits','leave',
    'pulse_surveys','succession','integrations','broadcast','whatsapp'
  ]::text[]));

-- ── 1. Insert the 5 missing role rows ────────────────────────────────────────
INSERT INTO public.roles (name, display_name, description, is_system_role, created_by) VALUES
  ('countryDirector',     'Country Director',        'Senior leadership with full read access across all hubs and high-level approval authority.',              true, NULL),
  ('projectManager',      'Project Manager',         'Full project lifecycle management including budget oversight, task assignment, and delivery approvals.',  true, NULL),
  ('seniorOperationsLead','Senior Operations Lead',  'Senior oversight of operations with financial override authority and cross-hub reporting access.',        true, NULL),
  ('dataTeam',            'Data Team',               'Data management and quality control. Can review, manage, and export site entry data and surveys.',       true, NULL),
  ('auditor',             'Auditor',                 'Read-only access to all financial, HR, and operational data for audit and compliance purposes.',         true, NULL)
ON CONFLICT (name) DO NOTHING;

-- ── 2. Country Director permissions ──────────────────────────────────────────
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('mmp',              'read'),   ('mmp',              'export'),
  ('finances',         'read'),   ('finances',         'create'),  ('finances',    'export'),
  ('cost_submissions', 'submit'), ('cost_submissions', 'read'),    ('cost_submissions','export'),
  ('wallets',          'read'),   ('wallets',          'update'),
  ('down_payments',    'read'),   ('down_payments',    'approve'),
  ('pre_funding',      'read'),   ('pre_funding',      'approve'),
  ('reports',          'read'),   ('reports',          'export'),
  ('site_visits',      'read'),
  ('projects',         'read'),
  ('portfolio',        'read'),
  ('analytics',        'read'),
  ('crm',              'read'),
  ('coverage_map',     'read'),
  ('notifications',    'read'),
  ('calendar',         'read'),   ('calendar',         'create'),
  ('tasks',            'read'),   ('tasks',            'create'),
  ('hr',               'read'),
  ('hr_analytics',     'read'),   ('hr_analytics',     'export'),
  ('pulse_surveys',    'read'),
  ('succession',       'read'),   ('succession',       'approve')
) AS p(resource, action)
WHERE r.name = 'countryDirector'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ── 3. Project Manager permissions ───────────────────────────────────────────
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('projects',         'create'), ('projects',         'read'),    ('projects',    'update'),
  ('projects',         'delete'), ('projects',         'assign'),  ('projects',    'approve'),
  ('projects',         'archive'),('projects',         'export'),
  ('portfolio',        'read'),
  ('analytics',        'read'),
  ('mmp',              'create'), ('mmp',              'read'),    ('mmp',         'update'),
  ('mmp',              'approve'),('mmp',              'assign'),  ('mmp',         'export'),
  ('site_visits',      'create'), ('site_visits',      'read'),    ('site_visits', 'update'),
  ('site_visits',      'assign'), ('site_visits',      'approve'), ('site_visits', 'export'),
  ('finances',         'read'),   ('finances',         'update'),  ('finances',    'approve'),
  ('finances',         'export'),
  ('cost_submissions', 'read'),   ('cost_submissions', 'export'),
  ('wallets',          'read'),   ('wallets',          'approve'),
  ('users',            'read'),   ('users',            'assign'),
  ('reports',          'read'),   ('reports',          'create'),  ('reports',     'export'),
  ('audit_logs',       'read'),
  ('settings',         'read'),
  ('crm',              'create'), ('crm',              'read'),    ('crm',         'update'),
  ('crm',              'export'),
  ('surveys',          'read'),   ('surveys',          'create'),
  ('tasks',            'create'), ('tasks',            'read'),    ('tasks',       'update'),
  ('tasks',            'assign'),
  ('notifications',    'read'),
  ('calendar',         'read'),   ('calendar',         'create'),
  ('signatures',       'read')
) AS p(resource, action)
WHERE r.name = 'projectManager'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ── 4. Senior Operations Lead permissions ────────────────────────────────────
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('projects',         'read'),   ('projects',         'update'),  ('projects',    'approve'),
  ('projects',         'export'),
  ('portfolio',        'read'),
  ('analytics',        'read'),
  ('mmp',              'read'),   ('mmp',              'update'),  ('mmp',         'approve'),
  ('mmp',              'export'),
  ('site_visits',      'read'),   ('site_visits',      'update'),  ('site_visits', 'approve'),
  ('site_visits',      'export'),
  ('finances',         'read'),   ('finances',         'update'),  ('finances',    'approve'),
  ('finances',         'override'),('finances',        'export'),
  ('cost_submissions', 'read'),   ('cost_submissions', 'approve'), ('cost_submissions','export'),
  ('wallets',          'read'),   ('wallets',          'approve'), ('wallets',     'override'),
  ('users',            'read'),
  ('reports',          'read'),   ('reports',          'create'),  ('reports',     'export'),
  ('audit_logs',       'read'),
  ('settings',         'read'),
  ('crm',              'read'),   ('crm',              'export'),
  ('tasks',            'read'),   ('tasks',            'create'),
  ('notifications',    'read'),
  ('calendar',         'read'),
  ('hr',               'read'),
  ('pulse_surveys',    'read'),
  ('succession',       'read'),   ('succession',       'update'),
  ('pre_funding',      'read'),
  ('procurement',      'read')
) AS p(resource, action)
WHERE r.name = 'seniorOperationsLead'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ── 5. Data Team permissions ──────────────────────────────────────────────────
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('projects',         'read'),
  ('analytics',        'read'),
  ('mmp',              'read'),   ('mmp',              'export'),
  ('site_visits',      'read'),   ('site_visits',      'export'),
  ('finances',         'read'),   ('finances',         'export'),
  ('cost_submissions', 'submit'), ('cost_submissions', 'read'),    ('cost_submissions','export'),
  ('reports',          'read'),   ('reports',          'create'),  ('reports',     'export'),
  ('users',            'read'),
  ('audit_logs',       'read'),
  ('crm',              'read'),
  ('surveys',          'create'), ('surveys',          'read'),    ('surveys',     'update'),
  ('surveys',          'export'),
  ('tasks',            'read'),   ('tasks',            'create'),
  ('notifications',    'read'),
  ('transactions',     'read'),   ('transactions',     'create'),
  ('pulse_surveys',    'read')
) AS p(resource, action)
WHERE r.name = 'dataTeam'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ── 6. Auditor permissions ────────────────────────────────────────────────────
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('finances',         'read'),   ('finances',         'export'),
  ('cost_submissions', 'read'),   ('cost_submissions', 'export'),
  ('accounting',       'read'),   ('accounting',       'export'),
  ('wallets',          'read'),   ('wallets',          'export'),
  ('down_payments',    'read'),   ('down_payments',    'export'),
  ('pre_funding',      'read'),   ('pre_funding',      'export'),
  ('procurement',      'read'),   ('procurement',      'export'),
  ('fixed_assets',     'read'),   ('fixed_assets',     'export'),
  ('reports',          'read'),   ('reports',          'export'),
  ('audit_logs',       'read'),   ('audit_logs',       'export'),
  ('projects',         'read'),
  ('users',            'read'),
  ('settings',         'read'),
  ('crm',              'read'),
  ('hr',               'read'),
  ('payroll',          'read'),
  ('benefits',         'read'),
  ('notifications',    'read'),
  ('transactions',     'read'),
  ('signatures',       'read')
) AS p(resource, action)
WHERE r.name = 'auditor'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- ── 7. Verify: show all system roles after seeding ───────────────────────────
SELECT
  r.name,
  r.display_name,
  r.is_system_role,
  r.is_active,
  COUNT(p.id) AS permission_count
FROM public.roles r
LEFT JOIN public.permissions p ON p.role_id = r.id
WHERE r.is_system_role = true
GROUP BY r.id, r.name, r.display_name, r.is_system_role, r.is_active
ORDER BY r.name;
