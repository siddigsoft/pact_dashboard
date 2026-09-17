-- Field Assistant is a Tier 1 payment operator, not a Tier 2 approver.
-- Keep dedicated payment capabilities from 20260917150000 while removing
-- role and user-level approval grants that would promote the account into the
-- narrow Tier 2 granted-approval workflow.

DELETE FROM public.permissions p
USING public.roles r
WHERE p.role_id = r.id
  AND r.is_active = true
  AND regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') = 'fieldassistant'
  AND p.action = 'approve'
  AND p.resource IN ('down_payments', 'cost_submissions', 'pre_funding');

DELETE FROM public.user_permission_overrides o
USING public.canonical_user_role_assignments a, public.roles r
WHERE o.user_id = a.user_id
  AND a.role_id = r.id
  AND r.is_active = true
  AND regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') = 'fieldassistant'
  AND o.is_granted = true
  AND o.action = 'approve'
  AND o.resource IN ('down_payments', 'cost_submissions', 'pre_funding');
