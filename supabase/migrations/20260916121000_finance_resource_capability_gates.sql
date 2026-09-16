-- Capability gates are ANDed with existing permissive ownership/hub/workflow
-- policies. None of these policies grants a new row scope.
BEGIN;

DO $gates$
DECLARE gate record; command text; policy_name text; predicate text;
BEGIN
  FOR gate IN SELECT * FROM (VALUES
    ('down_payment_requests', 'down_payments', 'read', 'submit', 'approve', 'delete'),
    ('operational_cost_submissions', 'cost_submissions', 'read', 'submit', 'update', 'delete'),
    ('site_visit_cost_submissions', 'cost_submissions', 'read', 'submit', 'update', 'delete'),
    ('pre_fund_requests', 'pre_funding', 'read', 'create', 'update', 'delete'),
    ('pre_fund_transactions', 'pre_funding', 'read', 'update', 'update', 'delete'),
    ('wallets', 'wallets', 'read', 'update', 'update', 'delete'),
    ('wallet_transactions', 'wallets', 'read', 'update', 'update', 'delete'),
    ('withdrawal_requests', 'wallets', 'read', NULL, 'approve', NULL),
    ('acct_journal_entries', 'accounting', 'read', 'create', 'update', 'delete'),
    ('acct_journal_lines', 'accounting', 'read', 'create', 'update', 'delete'),
    ('acct_fiscal_periods', 'accounting', 'read', 'create', 'update', 'delete')
  ) AS gates(table_name, resource, read_action, insert_action, update_action, delete_action)
  LOOP
    IF to_regclass('public.' || gate.table_name) IS NULL THEN
      RAISE NOTICE 'Optional finance table public.% is absent; no policy installed', gate.table_name;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', gate.table_name);
    FOREACH command IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      predicate := CASE command WHEN 'SELECT' THEN gate.read_action WHEN 'INSERT' THEN gate.insert_action
        WHEN 'UPDATE' THEN gate.update_action ELSE gate.delete_action END;
      IF predicate IS NULL THEN CONTINUE; END IF;
      predicate := format('public.current_user_has_resource_permission(%L,%L)', gate.resource, predicate);
      -- Self submission and administrative creation are separate capabilities.
      IF command = 'INSERT' AND gate.table_name IN ('down_payment_requests', 'operational_cost_submissions', 'site_visit_cost_submissions') THEN
        predicate := format('((%I = auth.uid() AND %s) OR public.current_user_has_resource_permission(%L,%L))',
          CASE WHEN gate.table_name = 'down_payment_requests' THEN 'requested_by' ELSE 'submitted_by' END,
          predicate, gate.resource, 'create');
      END IF;
      -- A draft edit and a workflow transition are distinct actions. The
      -- transition trigger below chooses the exact capability from OLD/NEW.
      IF command = 'UPDATE' AND gate.table_name IN ('down_payment_requests', 'operational_cost_submissions') THEN
        predicate := format('(public.current_user_has_resource_permission(%L,%L) OR public.current_user_has_resource_permission(%L,%L))', gate.resource, 'update', gate.resource, 'approve');
      END IF;
      policy_name := 'canonical_capability_' || lower(command);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, gate.table_name);
      IF command = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', policy_name, gate.table_name, predicate);
      ELSIF command = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', policy_name, gate.table_name, predicate, predicate);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING (%s)', policy_name, gate.table_name, command, predicate);
      END IF;
    END LOOP;
  END LOOP;
END;
$gates$;

-- Prevent direct REST updates from using approve permission as a general edit
-- permission. Existing RLS still determines which request/hub may be touched.
CREATE OR REPLACE FUNCTION public.guard_finance_resource_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before_row jsonb := to_jsonb(OLD); after_row jsonb := to_jsonb(NEW);
  resource text; approval_changed boolean; payment_changed boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  resource := CASE WHEN TG_TABLE_NAME = 'down_payment_requests' THEN 'down_payments' ELSE 'cost_submissions' END;
  approval_changed := (before_row->>'status' IS DISTINCT FROM after_row->>'status'
      AND after_row->>'status' IN ('approved','rejected','under_review','pending_admin'))
    OR before_row->>'tier1_status' IS DISTINCT FROM after_row->>'tier1_status'
    OR before_row->>'tier2_status' IS DISTINCT FROM after_row->>'tier2_status'
    OR before_row->>'supervisor_approved_by' IS DISTINCT FROM after_row->>'supervisor_approved_by'
    OR before_row->>'admin_processed_by' IS DISTINCT FROM after_row->>'admin_processed_by';
  payment_changed := before_row->>'total_paid_amount' IS DISTINCT FROM after_row->>'total_paid_amount'
    OR before_row->>'paid_amount_cents' IS DISTINCT FROM after_row->>'paid_amount_cents'
    OR before_row->>'wallet_transaction_id' IS DISTINCT FROM after_row->>'wallet_transaction_id'
    OR before_row->>'wallet_transaction_ids' IS DISTINCT FROM after_row->>'wallet_transaction_ids'
    OR (before_row->>'status' IS DISTINCT FROM after_row->>'status' AND after_row->>'status' IN ('paid','partially_paid','fully_paid'));
  IF payment_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
    PERFORM public.assert_resource_permission('pre_funding', 'update');
    IF TG_TABLE_NAME = 'down_payment_requests' THEN PERFORM public.assert_resource_permission('wallets', 'update'); END IF;
  ELSIF approval_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
  ELSE
    PERFORM public.assert_resource_permission(resource, 'update');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_finance_resource_transition() FROM PUBLIC, authenticated, anon;
DROP TRIGGER IF EXISTS canonical_resource_transition ON public.down_payment_requests;
CREATE TRIGGER canonical_resource_transition BEFORE UPDATE ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_resource_transition();
DROP TRIGGER IF EXISTS canonical_resource_transition ON public.operational_cost_submissions;
CREATE TRIGGER canonical_resource_transition BEFORE UPDATE ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_resource_transition();

-- The list RPC is a definer function and does not run table RLS. Keep the
-- existing authoritative selector predicate and add the same capability gate.
CREATE OR REPLACE FUNCTION public.get_all_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT submission.* FROM public.operational_cost_submissions submission
  WHERE public.current_user_has_resource_permission('cost_submissions', 'read')
    AND public.can_view_operational_cost_submission(submission.id, auth.uid())
  ORDER BY submission.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_all_operational_cost_submissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_operational_cost_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_pre_fund_payment_history()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.current_user_has_resource_permission('pre_funding', 'read')
    AND public.current_user_has_resource_permission('accounting', 'read')
    AND (public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.canonical_user_role_assignments a
      JOIN public.roles r ON r.id = a.role_id AND r.is_active
      WHERE a.user_id = auth.uid() AND regexp_replace(lower(r.name), '[^a-z]', '', 'g')
        IN ('admin','administrator','finance','financeadmin','financialadmin','accountant','superadmin')
    ));
$$;
REVOKE ALL ON FUNCTION public.can_read_pre_fund_payment_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_pre_fund_payment_history() TO authenticated;

COMMIT;
