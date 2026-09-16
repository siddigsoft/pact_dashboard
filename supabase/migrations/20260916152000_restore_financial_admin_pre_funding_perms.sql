-- financialAdmin lost its DEFAULT_ROLE_PERMISSIONS set (only 16 rows left,
-- none for pre_funding). Capability RLS then denied every fund SELECT even
-- though the page role baseline still admitted the hub.
-- Restore the FinancialAdmin catalogue from src/types/roles.ts and add the
-- pre_funding update/delete actions the capability gates require for edits.

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (VALUES
  ('site_visits', 'read'),
  ('finances', 'read'), ('finances', 'update'),
  ('finances', 'approve'), ('finances', 'export'),
  ('cost_submissions', 'read'), ('cost_submissions', 'approve'),
  ('cost_submissions', 'export'),
  ('wallets', 'read'), ('wallets', 'update'),
  ('wallets', 'approve'), ('wallets', 'export'),
  ('accounting', 'read'), ('accounting', 'create'),
  ('accounting', 'update'), ('accounting', 'export'),
  ('down_payments', 'read'), ('down_payments', 'approve'),
  ('down_payments', 'export'),
  ('pre_funding', 'read'), ('pre_funding', 'create'),
  ('pre_funding', 'update'), ('pre_funding', 'delete'),
  ('pre_funding', 'approve'), ('pre_funding', 'export'),
  ('procurement', 'read'), ('procurement', 'create'),
  ('procurement', 'update'), ('procurement', 'approve'),
  ('procurement', 'export'),
  ('fixed_assets', 'read'), ('fixed_assets', 'create'),
  ('fixed_assets', 'update'), ('fixed_assets', 'export'),
  ('mmp', 'archive'), ('mmp', 'read'),
  ('reports', 'read'), ('reports', 'export'),
  ('crm', 'read'),
  ('audit_logs', 'read'),
  ('transactions', 'read'), ('transactions', 'create'),
  ('notifications', 'read'),
  ('signatures', 'read'), ('signatures', 'create'),
  ('payroll', 'read'), ('payroll', 'export'),
  ('hr', 'read')
) AS v(resource, action)
WHERE r.name = 'financialAdmin'
ON CONFLICT (role_id, resource, action) DO NOTHING;
