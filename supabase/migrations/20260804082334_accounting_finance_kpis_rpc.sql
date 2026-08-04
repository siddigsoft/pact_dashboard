-- Single round-trip finance dashboard KPIs (replaces 13 client-side full-table scans).

CREATE OR REPLACE FUNCTION public.get_accounting_finance_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_budget jsonb;
  v_journals jsonb;
  v_pos jsonb;
  v_cash jsonb;
  v_revenue jsonb;
  v_coa jsonb;
  v_modules jsonb;
  v_prefund jsonb;
  v_assets jsonb;
  v_monthly jsonb;
  v_ap jsonb;
  v_phase4 jsonb;
  v_phase5 jsonb;
  v_ytd date := date_trunc('year', CURRENT_DATE)::date;
BEGIN
  -- Budget
  SELECT jsonb_build_object(
    'totalBudget', COALESCE(SUM(total_budget_cents) FILTER (WHERE status IS DISTINCT FROM 'closed'), 0) / 100.0,
    'totalSpent', COALESCE(SUM(spent_budget_cents) FILTER (WHERE status IS DISTINCT FROM 'closed'), 0) / 100.0,
    'utilizationPct', CASE
      WHEN COALESCE(SUM(total_budget_cents) FILTER (WHERE status IS DISTINCT FROM 'closed'), 0) > 0
      THEN ROUND(
        (SUM(spent_budget_cents) FILTER (WHERE status IS DISTINCT FROM 'closed')::numeric
          / SUM(total_budget_cents) FILTER (WHERE status IS DISTINCT FROM 'closed')::numeric) * 100
      )::int
      ELSE 0 END,
    'activeBudgets', COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'closed'),
    'overBudgetCount', COUNT(*) FILTER (
      WHERE status IS DISTINCT FROM 'closed'
        AND COALESCE(spent_budget_cents, 0) > COALESCE(total_budget_cents, 1)
    )
  ) INTO v_budget
  FROM project_budgets;

  -- Journals
  SELECT jsonb_build_object(
    'draftCount', COUNT(*) FILTER (WHERE status = 'draft'),
    'pendingCount', COUNT(*) FILTER (WHERE status = 'pending_approval'),
    'postedCount', COUNT(*) FILTER (WHERE status = 'posted'),
    'recent', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.ord)
      FROM (
        SELECT
          jsonb_build_object(
            'id', e.id,
            'date', e.posting_date,
            'desc', COALESCE(e.description_en, 'Journal Entry'),
            'amount', COALESCE((
              SELECT SUM(l.functional_amount)
              FROM acct_journal_lines l
              WHERE l.entry_id = e.id AND l.debit_credit = 'DR'
            ), 0),
            'status', e.status
          ) AS r,
          1 AS ord
        FROM acct_journal_entries e
        ORDER BY e.posting_date DESC NULLS LAST
        LIMIT 8
      ) x
    ), '[]'::jsonb)
  ) INTO v_journals
  FROM acct_journal_entries;

  -- Purchase orders
  IF to_regclass('public.acct_purchase_orders') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'pendingCount', COUNT(*) FILTER (WHERE status = 'submitted'),
      'pendingAmount', COALESCE(SUM(amount) FILTER (WHERE status = 'submitted'), 0),
      'draftCount', COUNT(*) FILTER (WHERE status = 'draft'),
      'approvedCount', COUNT(*) FILTER (WHERE status = 'approved')
    ) INTO v_pos
    FROM acct_purchase_orders;
  ELSE
    v_pos := '{"pendingCount":0,"pendingAmount":0,"draftCount":0,"approvedCount":0}'::jsonb;
  END IF;

  -- Cash
  IF to_regclass('public.acct_bank_accounts') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'totalCash', COALESCE(SUM(current_balance) FILTER (WHERE is_active IS DISTINCT FROM false), 0),
      'accountCount', COUNT(*) FILTER (WHERE is_active IS DISTINCT FROM false),
      'unreconciledCount', 0
    ) INTO v_cash
    FROM acct_bank_accounts;
  ELSE
    v_cash := '{"totalCash":0,"accountCount":0,"unreconciledCount":0}'::jsonb;
  END IF;

  -- YTD revenue / expense
  IF to_regclass('public.acct_accounts') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'totalRevenue', COALESCE(SUM(l.functional_amount) FILTER (
        WHERE a.account_type = 'revenue' AND l.debit_credit = 'CR'
      ), 0),
      'totalExpense', COALESCE(SUM(l.functional_amount) FILTER (
        WHERE a.account_type = 'expense' AND l.debit_credit = 'DR'
      ), 0),
      'netIncome',
        COALESCE(SUM(l.functional_amount) FILTER (WHERE a.account_type = 'revenue' AND l.debit_credit = 'CR'), 0)
        - COALESCE(SUM(l.functional_amount) FILTER (WHERE a.account_type = 'expense' AND l.debit_credit = 'DR'), 0),
      'ytdRevenue', COALESCE(SUM(l.functional_amount) FILTER (
        WHERE a.account_type = 'revenue' AND l.debit_credit = 'CR'
      ), 0)
    ) INTO v_revenue
    FROM acct_journal_lines l
    JOIN acct_accounts a ON a.id = l.account_id
    JOIN acct_journal_entries e ON e.id = l.entry_id
    WHERE e.status = 'posted' AND e.posting_date >= v_ytd;
  ELSE
    v_revenue := '{"totalRevenue":0,"totalExpense":0,"netIncome":0,"ytdRevenue":0}'::jsonb;
  END IF;

  -- COA meta
  SELECT jsonb_build_object(
    'accountCount', CASE WHEN to_regclass('public.acct_accounts') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_accounts) END,
    'fundCount', CASE WHEN to_regclass('public.acct_funds') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_funds) END,
    'fiscalPeriodCount', CASE WHEN to_regclass('public.acct_fiscal_periods') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_fiscal_periods) END,
    'activePeriod', (
      SELECT format('P%s · %s–%s',
        lpad(period_no::text, 2, '0'),
        to_char(start_date, 'Mon DD'),
        to_char(end_date, 'Mon DD YY'))
      FROM acct_fiscal_periods
      WHERE status IN ('open', 'soft_closed')
      ORDER BY start_date DESC
      LIMIT 1
    )
  ) INTO v_coa;

  -- Module probes (existence + counts)
  SELECT jsonb_build_object(
    'coa', jsonb_build_object('active', to_regclass('public.acct_accounts') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_accounts') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_accounts) END),
    'journals', jsonb_build_object('active', true, 'count', (SELECT COUNT(*) FROM acct_journal_entries)),
    'journalLines', jsonb_build_object('active', true, 'count', (SELECT COUNT(*) FROM acct_journal_lines)),
    'vendors', jsonb_build_object('active', to_regclass('public.acct_vendors') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_vendors') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_vendors) END),
    'assets', jsonb_build_object('active', to_regclass('public.acct_fixed_assets') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_fixed_assets') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_fixed_assets) END),
    'purchaseOrders', jsonb_build_object('active', to_regclass('public.acct_purchase_orders') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_purchase_orders') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_purchase_orders) END),
    'fiscalPeriods', jsonb_build_object('active', to_regclass('public.acct_fiscal_periods') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_fiscal_periods') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_fiscal_periods) END),
    'bankAccounts', jsonb_build_object('active', to_regclass('public.acct_bank_accounts') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_bank_accounts') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_bank_accounts) END),
    'funds', jsonb_build_object('active', to_regclass('public.acct_funds') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_funds') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_funds) END),
    'bankRecon', jsonb_build_object('active', to_regclass('public.acct_bank_recon_items') IS NOT NULL, 'count', CASE WHEN to_regclass('public.acct_bank_recon_items') IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM acct_bank_recon_items) END)
  ) INTO v_modules;

  -- Prefund
  IF to_regclass('public.pre_fund_requests') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'activeCount', COUNT(*) FILTER (WHERE status IN ('active', 'low_balance')),
      'totalAvailable', COALESCE(SUM(
        CASE
          WHEN currency = 'SDG' THEN available_balance / NULLIF((
            SELECT rate FROM acct_exchange_rates
            WHERE from_currency = 'USD' AND to_currency = 'SDG'
            ORDER BY effective_date DESC LIMIT 1
          ), 0)
          ELSE available_balance
        END
      ) FILTER (WHERE status IN ('active', 'low_balance')), 0),
      'lowBalanceCount', COUNT(*) FILTER (WHERE status = 'low_balance'),
      'pendingApproval', COUNT(*) FILTER (WHERE status = 'pending_approval')
    ) INTO v_prefund
    FROM pre_fund_requests;
  ELSE
    v_prefund := NULL;
  END IF;

  -- Fixed assets (straight-line book value approx)
  IF to_regclass('public.acct_fixed_assets') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'totalCost', COALESCE(SUM(acquisition_cost), 0),
      'totalBookValue', COALESCE(SUM(
        GREATEST(
          acquisition_cost - CASE
            WHEN COALESCE(useful_life_months, 0) > 0 THEN
              ((acquisition_cost - COALESCE(salvage_value, 0)) / useful_life_months)
              * LEAST(
                  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - acquisition_date::timestamptz)) / (86400 * 30))),
                  useful_life_months
                )
            ELSE 0
          END,
          COALESCE(salvage_value, 0)
        )
      ), 0),
      'activeCount', COUNT(*),
      'depreciatedPct', CASE
        WHEN COALESCE(SUM(acquisition_cost), 0) > 0 THEN ROUND(
          ((SUM(acquisition_cost) - SUM(
            GREATEST(
              acquisition_cost - CASE
                WHEN COALESCE(useful_life_months, 0) > 0 THEN
                  ((acquisition_cost - COALESCE(salvage_value, 0)) / useful_life_months)
                  * LEAST(
                      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - acquisition_date::timestamptz)) / (86400 * 30))),
                      useful_life_months
                    )
                ELSE 0
              END,
              COALESCE(salvage_value, 0)
            )
          )) / SUM(acquisition_cost)) * 100
        )::int
        ELSE 0
      END
    ) INTO v_assets
    FROM acct_fixed_assets
    WHERE status = 'active';
  ELSE
    v_assets := '{"totalBookValue":0,"totalCost":0,"activeCount":0,"depreciatedPct":0}'::jsonb;
  END IF;

  -- Monthly rev/exp last 6 months
  IF to_regclass('public.acct_accounts') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.sort_key), '[]'::jsonb)
    INTO v_monthly
    FROM (
      SELECT
        to_char(month_start, 'Mon YY') AS month,
        month_start AS sort_key,
        COALESCE(SUM(l.functional_amount) FILTER (WHERE a.account_type = 'revenue' AND l.debit_credit = 'CR'), 0) AS revenue,
        COALESCE(SUM(l.functional_amount) FILTER (WHERE a.account_type = 'expense' AND l.debit_credit = 'DR'), 0) AS expense
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS month_start
      LEFT JOIN acct_journal_entries e
        ON e.status = 'posted'
       AND e.posting_date >= month_start::date
       AND e.posting_date < (month_start + INTERVAL '1 month')::date
      LEFT JOIN acct_journal_lines l ON l.entry_id = e.id
      LEFT JOIN acct_accounts a ON a.id = l.account_id AND a.account_type IN ('revenue', 'expense')
      GROUP BY month_start
    ) m;
  ELSE
    v_monthly := '[]'::jsonb;
  END IF;

  -- Simplified AP: outstanding vendor CR-DR balances (aging buckets approximate via oldest posting date)
  IF to_regclass('public.acct_vendors') IS NOT NULL THEN
    WITH vendor_bal AS (
      SELECT
        l.vendor_id,
        SUM(CASE WHEN l.debit_credit = 'CR' THEN l.functional_amount ELSE -l.functional_amount END) AS balance,
        MIN(e.posting_date) AS oldest,
        COALESCE(MAX(v.payment_terms), 30) AS terms
      FROM acct_journal_lines l
      JOIN acct_journal_entries e ON e.id = l.entry_id
      LEFT JOIN acct_vendors v ON v.id = l.vendor_id
      WHERE l.vendor_id IS NOT NULL
      GROUP BY l.vendor_id
    ), aged AS (
      SELECT
        balance,
        (CURRENT_DATE - (oldest + (terms || ' days')::interval)::date) AS overdue
      FROM vendor_bal
      WHERE balance > 0
    )
    SELECT jsonb_build_object(
      'outstanding', COALESCE(SUM(balance), 0),
      'vendorCount', COUNT(*),
      'current', COALESCE(SUM(balance) FILTER (WHERE overdue IS NULL OR overdue <= 0), 0),
      'd1_30', COALESCE(SUM(balance) FILTER (WHERE overdue > 0 AND overdue <= 30), 0),
      'd31_60', COALESCE(SUM(balance) FILTER (WHERE overdue > 30 AND overdue <= 60), 0),
      'd61_90', COALESCE(SUM(balance) FILTER (WHERE overdue > 60 AND overdue <= 90), 0),
      'over90', COALESCE(SUM(balance) FILTER (WHERE overdue > 90), 0)
    ) INTO v_ap
    FROM aged;
  ELSE
    v_ap := '{"outstanding":0,"vendorCount":0,"current":0,"d1_30":0,"d31_60":0,"d61_90":0,"over90":0}'::jsonb;
  END IF;

  -- Phase 4 (best-effort)
  SELECT jsonb_build_object(
    'sodViolations', (
      SELECT COUNT(*) FROM acct_journal_entries
      WHERE status = 'posted' AND posted_by IS NOT NULL AND created_by IS NOT NULL AND created_by = posted_by
    ),
    'openEncumbranceTotal', CASE WHEN to_regclass('public.acct_budget_encumbrances') IS NULL THEN 0
      ELSE (SELECT COALESCE(SUM(amount), 0) FROM acct_budget_encumbrances WHERE status = 'open') END,
    'openEncumbranceCount', CASE WHEN to_regclass('public.acct_budget_encumbrances') IS NULL THEN 0
      ELSE (SELECT COUNT(*) FROM acct_budget_encumbrances WHERE status = 'open') END,
    'activeTaxCodes', CASE WHEN to_regclass('public.acct_tax_codes') IS NULL THEN 0
      ELSE (SELECT COUNT(*) FROM acct_tax_codes WHERE is_active = true) END,
    'periodCloseStatus', CASE WHEN to_regclass('public.acct_period_close_log') IS NULL THEN NULL
      ELSE (SELECT to_status FROM acct_period_close_log ORDER BY created_at DESC NULLS LAST LIMIT 1) END
  ) INTO v_phase4;

  -- Phase 5
  SELECT jsonb_build_object(
    'activeGrants', CASE WHEN to_regclass('public.acct_grants') IS NULL THEN 0
      ELSE (SELECT COUNT(*) FROM acct_grants WHERE status IN ('active', 'expiring_soon')) END,
    'totalGrantAwarded', CASE WHEN to_regclass('public.acct_grants') IS NULL THEN 0
      ELSE (SELECT COALESCE(SUM(award_amount), 0) FROM acct_grants WHERE status IN ('active', 'expiring_soon')) END,
    'lastDeprRunDate', CASE WHEN to_regclass('public.acct_depreciation_runs') IS NULL THEN NULL
      ELSE (SELECT run_date FROM acct_depreciation_runs ORDER BY run_date DESC LIMIT 1) END,
    'lastDeprRunAmount', CASE WHEN to_regclass('public.acct_depreciation_runs') IS NULL THEN 0
      ELSE (SELECT COALESCE(total_depreciation, 0) FROM acct_depreciation_runs ORDER BY run_date DESC LIMIT 1) END,
    'allocationRunsThisMonth', CASE WHEN to_regclass('public.acct_allocation_runs') IS NULL THEN 0
      ELSE (SELECT COUNT(*) FROM acct_allocation_runs WHERE run_date >= date_trunc('month', CURRENT_DATE)::date) END,
    'entityCount', CASE WHEN to_regclass('public.acct_accounts') IS NULL THEN 0
      ELSE (SELECT COUNT(DISTINCT country_id) FROM acct_accounts WHERE country_id IS NOT NULL) END
  ) INTO v_phase5;

  RETURN jsonb_build_object(
    'budget', COALESCE(v_budget, '{}'::jsonb),
    'ap', COALESCE(v_ap, '{}'::jsonb),
    'assets', COALESCE(v_assets, '{}'::jsonb),
    'journals', COALESCE(v_journals, '{}'::jsonb),
    'monthlyRevExp', COALESCE(v_monthly, '[]'::jsonb),
    'pos', COALESCE(v_pos, '{}'::jsonb),
    'cash', COALESCE(v_cash, '{}'::jsonb),
    'revenue', COALESCE(v_revenue, '{}'::jsonb),
    'coa', COALESCE(v_coa, '{}'::jsonb),
    'modules', COALESCE(v_modules, '{}'::jsonb),
    'phase4', COALESCE(v_phase4, '{}'::jsonb),
    'phase5', COALESCE(v_phase5, '{}'::jsonb),
    'preFund', v_prefund
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accounting_finance_kpis() TO authenticated;
