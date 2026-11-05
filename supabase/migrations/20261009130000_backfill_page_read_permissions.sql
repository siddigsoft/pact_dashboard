-- A page granted in Access defaults implies the read permission it needs to open.
-- Backfills those reads for existing roles; Role Management adds them on save
-- going forward (src/lib/page-default-permissions.ts). Self-service pages open
-- to all roles are excluded so they never grant org-wide reads.

WITH d(slug, resource, action) AS (VALUES
  ('field-payments','finances','read'),('cost-approval','cost_submissions','read'),
  ('cycle-exception-rollover','finances','read'),('cycle-exception-resolution','finances','read'),
  ('calendar','calendar','read'),('call-analytics','analytics','read'),('signatures','signatures','read'),
  ('programme-hub','projects','read'),('portfolio','portfolio','read'),('mmp','mmp','read'),
  ('mmp-full-report','mmp','full_report'),('project-updates','projects','read'),
  ('hub-operations','hub_operations','read'),('field-ops','site_visits','read'),
  ('monitoring-form','site_visits','read'),('field-operation-manager','hub_operations','read'),
  ('coverage-map','coverage_map','read'),('coordinator-sites','site_visits','read'),
  ('sites-for-verification','site_visits','read'),('supervisor-sites','site_visits','read'),
  ('coordinator-dashboard','hub_operations','read'),('monitoring-plan','mmp','read'),
  ('tracker-preparation','mmp','read'),('mmp-management','mmp','read'),
  ('finance-hub','finances','read'),('budget-requests','finances','read'),('wallet','wallets','read'),
  ('cost-submission','cost_submissions','read'),('tier1-approvals','cost_submissions','read'),
  ('tier2-approvals','cost_submissions','read'),('finance-processing','finances','read'),
  ('approvals','cost_submissions','read'),('approval-dashboard','cost_submissions','read'),
  ('down-payment-approval','down_payments','read'),('cost-submission-reports','cost_submissions','read'),
  ('wallet-reports','wallets','read'),('advance-requests-report','down_payments','read'),
  ('down-payment-advance-report','down_payments','read'),('enumerator-fees-report','finances','read'),
  ('month-end-summary','finances','read'),('exchange-rates','accounting','read'),
  ('cost-predictions','analytics','read'),('reconciliation-dashboard','accounting','read'),
  ('accounting-hub','accounting','read'),('accounting-coa','accounting','read'),
  ('accounting-journals','accounting','read'),('accounting-ledger','accounting','read'),
  ('accounting-trial-balance','accounting','read'),('accounting-bank-recon','accounting','read'),
  ('accounting-budget','finances','read'),('accounting-budget-variance','finances','read'),
  ('accounting-budget-encumbrance','finances','read'),('accounting-vendors','procurement','read'),
  ('accounting-purchase-req','procurement','read'),('accounting-ap-aging','procurement','read'),
  ('accounting-cheque-register','procurement','read'),('accounting-fixed-assets','fixed_assets','read'),
  ('accounting-depreciation','fixed_assets','read'),('accounting-grants','accounting','read'),
  ('accounting-cost-allocation','accounting','read'),('accounting-cash-flow','accounting','read'),
  ('accounting-cash-flow-forecast','finances','read'),('accounting-multi-currency','accounting','read'),
  ('accounting-tax','accounting','read'),('accounting-period-close','accounting','read'),
  ('accounting-donor-reports','accounting','read'),('accounting-sod','accounting','read'),
  ('accounting-consolidation','accounting','read'),('accounting-gl-audit','accounting','read'),
  ('accounting-aml','accounting','read'),('pre-funding','pre_funding','read'),
  ('team-tasks','tasks','read'),('employees','hr','read'),('attendance','hr','read'),
  ('offboarding','hr','read'),('staff-onboarding','hr','read'),('performance-reviews','hr_analytics','read'),
  ('salary-increments','payroll','read'),('training-certifications','hr','read'),
  ('retainer-management','payroll','read'),('payroll','payroll','read'),('positions','hr','read'),
  ('salary-retainer-report','payroll','read'),('crm','crm','read'),('analytics-hub','analytics','read'),
  ('notification-analytics','notifications','read'),('data-export-center','reports','read'),
  ('data-visibility','analytics','read'),('reports','reports','read'),('documents','reports','read'),
  ('archive','reports','read'),('dct-pdm','analytics','read'),('field-data','analytics','read'),
  ('executive','analytics','read'),('data-quality','surveys','read'),
  ('questionnaire-analytics','surveys','read'),('admin-hub','users','read'),('users','users','read'),
  ('departments','settings','read'),('role-management','roles','read'),
  ('role-management','permissions','read'),('classifications','settings','read'),
  ('classification-fees','settings','read'),('task-admin','tasks','read'),('settings','settings','read'),
  ('settings','integrations','read'),('hub-management','hub_operations','read'),
  ('integrations','integrations','read'),('staff-directory','users','read'),
  ('transaction-scanner','transactions','read'),('hierarchy-audit','audit_logs','read'),
  ('audit-compliance','audit_logs','read'),('audit-logs','audit_logs','read'),
  ('login-analytics','audit_logs','read')
)
INSERT INTO public.permissions (role_id, resource, action)
SELECT DISTINCT r.id, d.resource, d.action
FROM d
JOIN public.page_role_configs c ON c.page_slug = d.slug
JOIN public.roles r ON r.name = ANY (c.roles) AND r.is_active
WHERE r.name <> 'superAdmin'
ON CONFLICT (role_id, resource, action) DO NOTHING;
