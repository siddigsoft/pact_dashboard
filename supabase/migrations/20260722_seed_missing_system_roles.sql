-- ─────────────────────────────────────────────────────────────────────────────
-- Seed missing system roles
-- The original migration only seeded 8 of the 14 system roles.
-- This migration adds the missing ones idempotently (ON CONFLICT DO NOTHING).
-- Safe to re-run; existing rows are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.roles (name, display_name, description, is_system_role, is_active, created_by)
VALUES
  ('superAdmin',          'Super Admin',             'Full super-administrator access — all permissions and system settings', true, true, NULL),
  ('countryDirector',     'Country Director',        'Country-level oversight — strategic view of finance, programmes, HR, and analytics', true, true, NULL),
  ('projectManager',      'Project Manager',         'Manages project lifecycle, deliverables, budgets, and reporting', true, true, NULL),
  ('seniorOperationsLead','Senior Operations Lead',  'Senior field operations leadership with cross-hub oversight', true, true, NULL),
  ('dataTeam',            'Data Team',               'Data processing and validation team with access to submissions and MMP data', true, true, NULL),
  ('auditor',             'Auditor',                 'Read-only financial and operational audit access for compliance and review', true, true, NULL)
ON CONFLICT (name) DO NOTHING;

-- ── Seed basic permissions for the new roles ──────────────────────────────────

-- Country Director
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('mmp',              'read'),   ('mmp',              'export'),
  ('site_visits',      'read'),
  ('projects',         'read'),   ('portfolio',        'read'),
  ('analytics',        'read'),
  ('finances',         'read'),   ('finances',         'export'),
  ('cost_submissions', 'read'),
  ('down_payments',    'read'),   ('down_payments',    'approve'),
  ('pre_funding',      'read'),   ('pre_funding',      'approve'),
  ('wallets',          'read'),
  ('reports',          'read'),   ('reports',          'export'),
  ('crm',              'read'),
  ('hr',               'read'),
  ('hr_analytics',     'read'),   ('hr_analytics',     'export'),
  ('coverage_map',     'read'),
  ('notifications',    'read'),
  ('calendar',         'read'),   ('calendar',         'create'),
  ('tasks',            'read'),   ('tasks',            'create'),
  ('succession',       'read'),   ('succession',       'approve'),
  ('pulse_surveys',    'read')
) AS p(resource, action)
WHERE r.name = 'countryDirector'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Project Manager
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('projects',      'create'), ('projects',      'read'), ('projects',      'update'),
  ('projects',      'archive'), ('projects',      'assign'), ('projects',      'export'),
  ('portfolio',     'read'),   ('analytics',     'read'),
  ('mmp',           'read'),
  ('tasks',         'create'), ('tasks',         'read'), ('tasks',         'update'),
  ('tasks',         'assign'), ('tasks',         'export'),
  ('reports',       'read'),   ('reports',       'create'), ('reports',       'export'),
  ('calendar',      'read'),   ('calendar',      'create'),
  ('notifications', 'read'),
  ('surveys',       'read')
) AS p(resource, action)
WHERE r.name = 'projectManager'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Senior Operations Lead
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('mmp',              'read'), ('mmp',              'update'), ('mmp',              'approve'),
  ('site_visits',      'read'), ('site_visits',      'update'), ('site_visits',      'assign'),
  ('hub_operations',   'read'), ('hub_operations',   'update'),
  ('projects',         'read'),
  ('finances',         'read'),
  ('cost_submissions', 'read'),
  ('reports',          'read'), ('reports',          'export'),
  ('calendar',         'read'), ('calendar',         'create'),
  ('tasks',            'read'), ('tasks',            'create'), ('tasks',            'assign'),
  ('notifications',    'read'),
  ('coverage_map',     'read')
) AS p(resource, action)
WHERE r.name = 'seniorOperationsLead'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Data Team
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('mmp',              'read'), ('mmp',              'update'),
  ('site_visits',      'read'), ('site_visits',      'create'),
  ('cost_submissions', 'read'), ('cost_submissions', 'create'),
  ('reports',          'read'),
  ('notifications',    'read'),
  ('tasks',            'read'), ('tasks',            'create'),
  ('surveys',          'read'), ('surveys',          'create')
) AS p(resource, action)
WHERE r.name = 'dataTeam'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Auditor
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('finances',         'read'), ('finances',         'export'),
  ('cost_submissions', 'read'), ('cost_submissions', 'export'),
  ('down_payments',    'read'), ('down_payments',    'approve'),
  ('wallets',          'read'),
  ('accounting',       'read'), ('accounting',       'export'),
  ('pre_funding',      'read'),
  ('procurement',      'read'), ('procurement',      'export'),
  ('fixed_assets',     'read'), ('fixed_assets',     'export'),
  ('audit_logs',       'read'), ('audit_logs',       'export'),
  ('reports',          'read'), ('reports',          'export'),
  ('notifications',    'read'),
  ('mmp',              'read'),
  ('site_visits',      'read'),
  ('tasks',            'read'),
  ('payroll',          'read')
) AS p(resource, action)
WHERE r.name = 'auditor'
ON CONFLICT (role_id, resource, action) DO NOTHING;

-- Super Admin (full access — mirror admin but mark separately)
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action
FROM public.roles r,
(VALUES
  ('users',            'create'), ('users',            'read'), ('users',            'update'), ('users',            'delete'), ('users',            'assign'),
  ('roles',            'create'), ('roles',            'read'), ('roles',            'update'), ('roles',            'delete'), ('roles',            'assign'),
  ('permissions',      'create'), ('permissions',      'read'), ('permissions',      'update'), ('permissions',      'delete'),
  ('system',           'read'),   ('system',           'update'),
  ('settings',         'read'),   ('settings',         'update'),
  ('audit_logs',       'read'),   ('audit_logs',       'export'),
  ('super_admins',     'read'),   ('super_admins',     'update'),
  ('projects',         'create'), ('projects',         'read'), ('projects',         'update'), ('projects',         'delete'), ('projects',         'approve'), ('projects',         'archive'), ('projects',         'export'),
  ('mmp',              'create'), ('mmp',              'read'), ('mmp',              'update'), ('mmp',              'delete'), ('mmp',              'approve'), ('mmp',              'archive'), ('mmp',              'export'),
  ('site_visits',      'create'), ('site_visits',      'read'), ('site_visits',      'update'), ('site_visits',      'delete'), ('site_visits',      'approve'), ('site_visits',      'export'),
  ('finances',         'create'), ('finances',         'read'), ('finances',         'update'), ('finances',         'delete'), ('finances',         'approve'), ('finances',         'export'),
  ('wallets',          'create'), ('wallets',          'read'), ('wallets',          'update'), ('wallets',          'approve'), ('wallets',          'export'),
  ('accounting',       'read'),   ('accounting',       'export'),
  ('cost_submissions', 'create'), ('cost_submissions', 'read'), ('cost_submissions', 'update'), ('cost_submissions', 'approve'), ('cost_submissions', 'delete'), ('cost_submissions', 'export'),
  ('down_payments',    'create'), ('down_payments',    'read'), ('down_payments',    'update'), ('down_payments',    'approve'),
  ('pre_funding',      'create'), ('pre_funding',      'read'), ('pre_funding',      'approve'), ('pre_funding',      'export'),
  ('procurement',      'read'),   ('procurement',      'approve'), ('procurement',      'export'),
  ('fixed_assets',     'read'),   ('fixed_assets',     'export'),
  ('hr',               'read'),   ('hr',               'update'), ('hr',               'export'),
  ('payroll',          'read'),   ('payroll',          'approve'), ('payroll',          'export'),
  ('leave',            'read'),   ('leave',            'approve'),
  ('surveys',          'create'), ('surveys',          'read'), ('surveys',          'update'), ('surveys',          'delete'), ('surveys',          'export'),
  ('tasks',            'create'), ('tasks',            'read'), ('tasks',            'update'), ('tasks',            'delete'), ('tasks',            'assign'), ('tasks',            'export'),
  ('notifications',    'read'),   ('notifications',    'create'),
  ('broadcast',        'create'), ('broadcast',        'read'),
  ('calendar',         'read'),   ('calendar',         'create'),
  ('crm',              'create'), ('crm',              'read'), ('crm',              'update'), ('crm',              'delete'), ('crm',              'export'),
  ('reports',          'read'),   ('reports',          'create'), ('reports',          'delete'), ('reports',          'export'),
  ('coverage_map',     'read'),
  ('safety',           'read'),   ('safety',           'update'),
  ('incidents',        'read'),   ('incidents',        'update'), ('incidents',        'delete'),
  ('equipment',        'read'),   ('equipment',        'update'),
  ('hub_operations',   'read'),   ('hub_operations',   'update'),
  ('analytics',        'read'),   ('analytics',        'export'),
  ('portfolio',        'read'),   ('portfolio',        'export'),
  ('integrations',     'read'),   ('integrations',     'update'),
  ('transactions',     'read'),
  ('benefits',         'read'),   ('benefits',         'update'), ('benefits',         'approve'), ('benefits',         'export'),
  ('succession',       'read'),   ('succession',       'update'), ('succession',       'export'),
  ('pulse_surveys',    'create'), ('pulse_surveys',    'read'), ('pulse_surveys',    'update'), ('pulse_surveys',    'export'),
  ('hr_analytics',     'read'),   ('hr_analytics',     'export'),
  ('signatures',       'read'),   ('signatures',       'create'),
  ('whatsapp',         'read'),   ('whatsapp',         'update')
) AS p(resource, action)
WHERE r.name = 'superAdmin'
ON CONFLICT (role_id, resource, action) DO NOTHING;
