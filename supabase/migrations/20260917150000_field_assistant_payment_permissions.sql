-- Allow the existing Field Assistant canonical role to post approved
-- Cost Submission and Down Payment payments from an eligible Pre-Fund.
--
-- This deliberately does not grant approve, reverse, reconcile, update, or
-- broader finance/accounting permissions. The payment RPCs continue to enforce
-- source status, receipt, currency, fund balance, row scope, and idempotency.

INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, capability.resource, capability.action
FROM public.roles r
CROSS JOIN (VALUES
  ('down_payments', 'mark_paid'),
  ('cost_submissions', 'mark_paid'),
  ('pre_funding', 'use_for_payment')
) AS capability(resource, action)
WHERE regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') = 'fieldassistant'
  AND r.is_active = true
ON CONFLICT (role_id, resource, action) DO NOTHING;

COMMENT ON TABLE public.permissions IS
  'Canonical role capabilities. Field Assistant payment authority is limited to dedicated mark_paid actions plus eligible Pre-Fund use.';