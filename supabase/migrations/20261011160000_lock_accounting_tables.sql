-- Accounting tables were readable (and most writable) by any authenticated
-- user. Replace every permissive policy on them with the canonical
-- `accounting` resource permissions (role grants + per-user overrides +
-- Super Admin). The permission check is wrapped in a scalar sub-select so it
-- runs once per statement instead of once per row.
--
-- Not touched here:
--   * tables that already use canonical/role-scoped rules
--     (journal entries/lines, fiscal periods, GL bridge, finance audit log,
--      SOD violations, sanctioned parties, AML alerts, intercompany,
--      synthetic marker, payroll tax/social/zakat tables)
--   * acct_exchange_rates: shared reference data written from MMP screens.
--   * RESTRICTIVE policies (per-user override ceilings) are kept.
DO $$
DECLARE
  locked_tables text[] := ARRAY[
    'acct_allocation_runs', 'acct_analytic_accounts', 'acct_analytic_distribution_models',
    'acct_analytic_plans', 'acct_asset_revaluations', 'acct_audit_pack_items',
    'acct_audit_packs', 'acct_auditor_findings', 'acct_bank_accounts',
    'acct_bank_statement_lines', 'acct_budget_approvals', 'acct_budget_audit_log',
    'acct_budget_encumbrances', 'acct_budget_lines', 'acct_cash_count_sheets',
    'acct_cash_flow_adjustments', 'acct_cheque_register', 'acct_cost_allocation_rules',
    'acct_cost_allocation_targets', 'acct_customer_invoice_lines', 'acct_customer_invoices',
    'acct_customer_payments', 'acct_deferred_items', 'acct_deferred_recognition_lines',
    'acct_depreciation_runs', 'acct_expense_categories', 'acct_expense_report_lines',
    'acct_expense_reports', 'acct_fiscal_position_account_map', 'acct_fiscal_position_tax_map',
    'acct_fiscal_positions', 'acct_fixed_assets', 'acct_follow_up_levels', 'acct_funds',
    'acct_grant_expenses', 'acct_grant_milestones', 'acct_grants', 'acct_grn_lines',
    'acct_grn_receipts', 'acct_invoice_lines', 'acct_invoices', 'acct_journal_template_lines',
    'acct_journal_templates', 'acct_loan_payments', 'acct_loans', 'acct_lock_dates',
    'acct_payment_allocations', 'acct_payment_term_lines', 'acct_payment_terms',
    'acct_payments', 'acct_per_diem_rates', 'acct_period_close_log', 'acct_petty_cash_boxes',
    'acct_petty_cash_transactions', 'acct_po_lines', 'acct_pr_lines', 'acct_purchase_orders',
    'acct_purchase_requisitions', 'acct_recurring_journal_lines', 'acct_recurring_journals',
    'acct_sod_rules', 'acct_statutory_filings', 'acct_tax_codes', 'acct_tax_withholding',
    'acct_vendors', 'acct_wire_transfers', 'acct_withholding_tax_entries',
    'acct_withholding_tax_rates'
  ];
  -- Chart of accounts and fiscal years are reference data read by
  -- pre-funding screens; only their writes are locked.
  shared_read_tables text[] := ARRAY['acct_accounts', 'acct_fiscal_years'];
  -- Append-only logs written as a side effect of create/update actions.
  log_tables text[] := ARRAY['acct_budget_audit_log', 'acct_period_close_log'];
  t text;
  pol record;
  perm constant text := '(select public.current_user_has_resource_permission(''accounting'', %L))';
BEGIN
  FOREACH t IN ARRAY locked_tables || shared_read_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND permissive = 'PERMISSIVE'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF t = ANY (shared_read_tables) THEN
      EXECUTE format('CREATE POLICY acct_read ON public.%I FOR SELECT TO authenticated USING (true)', t);
    ELSE
      EXECUTE format('CREATE POLICY acct_read ON public.%I FOR SELECT TO authenticated USING (%s)',
        t, format(perm, 'read'));
    END IF;

    IF t = ANY (log_tables) THEN
      EXECUTE format('CREATE POLICY acct_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s OR %s)',
        t, format(perm, 'create'), format(perm, 'update'));
      CONTINUE;
    END IF;

    EXECUTE format('CREATE POLICY acct_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      t, format(perm, 'create'));
    EXECUTE format('CREATE POLICY acct_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t, format(perm, 'update'), format(perm, 'update'));
    EXECUTE format('CREATE POLICY acct_delete ON public.%I FOR DELETE TO authenticated USING (%s)',
      t, format(perm, 'delete'));
  END LOOP;
END $$;
