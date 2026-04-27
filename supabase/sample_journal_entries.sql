-- ============================================================
-- PACT Command Center — Sample Journal Entries
-- Rwanda · Qatar · USA · Kenya (+ any existing Sudan/SD)
-- Apply in Supabase SQL editor AFTER running:
--   1. 20260501_acct_phase1_sprint1_1.sql
--   2. 20260508_acct_phase1_sprint1_2.sql
--   3. 20260515_acct_phase1_sprint1_3.sql
--   4. coa_countries_migration.sql
--   5. coa_rw_qa_us_ke_migration.sql
-- NOTE: This inserts directly (bypassing acct_post_journal) so
--       it runs even before a user session exists. Status = posted.
-- ============================================================

DO $$
DECLARE
  -- Period (use the most recent open / soft-closed period, or any period)
  v_period_id UUID;
  v_period_date DATE;

  -- Funds — one per country attempt (fall back to any active fund)
  v_fund_id UUID;

  -- Country ids
  id_rw UUID; id_qa UUID; id_us UUID; id_ke UUID;

  -- Account ids — resolved by code
  -- Rwanda
  rw_cash        UUID; rw_bank        UUID;
  rw_grant_recv  UUID; rw_grant_rev   UUID;
  rw_salary      UUID; rw_rssb        UUID;
  rw_ap_vendor   UUID; rw_accrued_pay UUID;
  rw_travel_int  UUID; rw_training    UUID;
  rw_rent        UUID; rw_idc         UUID;
  rw_net_unrest  UUID;

  -- Qatar
  qa_cash        UUID; qa_bank        UUID;
  qa_grant_recv  UUID; qa_grant_rev   UUID;
  qa_salary      UUID; qa_eos         UUID;
  qa_ap_vendor   UUID; qa_accrued_pay UUID;
  qa_travel_int  UUID; qa_training    UUID;
  qa_rent        UUID; qa_idc         UUID;
  qa_net_unrest  UUID;

  -- USA
  us_bank_op     UUID; us_bank_pay    UUID;
  us_fed_recv    UUID; us_usaid_rev   UUID;
  us_salary_ex   UUID; us_health      UUID;
  us_fica_oasdi  UUID; us_ap_vendor   UUID;
  us_accrued_pay UUID; us_def_grant   UUID;
  us_dom_travel  UUID; us_training    UUID;
  us_rent        UUID; us_nicra       UUID;
  us_net_donor   UUID;

  -- Kenya
  ke_cash        UUID; ke_mpesa       UUID;
  ke_grant_recv  UUID; ke_usaid_rev   UUID;
  ke_salary      UUID; ke_nhif        UUID;
  ke_nssf        UUID; ke_paye        UUID;
  ke_ap_vendor   UUID; ke_accrued_pay UUID;
  ke_travel_int  UUID; ke_training    UUID;
  ke_rent        UUID; ke_idc         UUID;
  ke_net_unrest  UUID;

  v_entry_id UUID;
  v_admin_id UUID;
BEGIN
  -- ── Resolve an admin user id (v_admin_id = NULL in SQL editor) ──
  SELECT id INTO v_admin_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Create at least one user first.';
  END IF;

  -- ── Resolve period ──────────────────────────────────────────
  SELECT id, start_date::DATE INTO v_period_id, v_period_date
  FROM acct_fiscal_periods
  ORDER BY
    CASE status WHEN 'open' THEN 0 WHEN 'soft_closed' THEN 1 ELSE 2 END,
    start_date DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No fiscal periods found. Create at least one fiscal year and period first.';
  END IF;

  -- ── Resolve fund ────────────────────────────────────────────
  SELECT id INTO v_fund_id FROM acct_funds WHERE is_active = TRUE ORDER BY code LIMIT 1;
  IF v_fund_id IS NULL THEN
    RAISE EXCEPTION 'No active funds found. Create at least one fund first.';
  END IF;

  -- ── Resolve country ids ─────────────────────────────────────
  SELECT id INTO id_rw FROM countries WHERE code = 'RW' LIMIT 1;
  SELECT id INTO id_qa FROM countries WHERE code = 'QA' LIMIT 1;
  SELECT id INTO id_us FROM countries WHERE code = 'US' LIMIT 1;
  SELECT id INTO id_ke FROM countries WHERE code = 'KE' LIMIT 1;

  -- ================================================================
  -- ██████████  RWANDA  ██████████
  -- ================================================================
  IF id_rw IS NOT NULL THEN
    SELECT id INTO rw_cash       FROM acct_accounts WHERE code = 'RW-1101' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_bank       FROM acct_accounts WHERE code = 'RW-1102' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_grant_recv FROM acct_accounts WHERE code = 'RW-1201' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_grant_rev  FROM acct_accounts WHERE code = 'RW-4101' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_salary     FROM acct_accounts WHERE code = 'RW-5101' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_rssb       FROM acct_accounts WHERE code = 'RW-5104' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_ap_vendor  FROM acct_accounts WHERE code = 'RW-2101' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_accrued_pay FROM acct_accounts WHERE code = 'RW-2201' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_travel_int FROM acct_accounts WHERE code = 'RW-5202' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_training   FROM acct_accounts WHERE code = 'RW-5302' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_rent       FROM acct_accounts WHERE code = 'RW-5401' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_idc        FROM acct_accounts WHERE code = 'RW-5601' AND country_id = id_rw LIMIT 1;
    SELECT id INTO rw_net_unrest FROM acct_accounts WHERE code = 'RW-3001' AND country_id = id_rw LIMIT 1;

    IF rw_bank IS NULL OR rw_grant_rev IS NULL OR rw_salary IS NULL THEN
      RAISE WARNING 'Rwanda COA accounts not found. Run coa_rw_qa_us_ke_migration.sql first. Skipping Rwanda entries.';
    ELSE

    -- RW-JE-001: USAID Grant Receipt — Cash received from USAID Kigali
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, source_id, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 1, 'USAID Grant Receipt — Kigali Q1', 'استلام منحة USAID — كيغالي الربع الأول', 'manual', NULL, 'posted', 'sample-rw-je-001', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, rw_bank,       v_fund_id, 'program', 'DR', 15000000, 'RWF', 15000000, 'RWF', 1),
      (v_entry_id, 2, rw_grant_rev,  v_fund_id, 'program', 'CR', 15000000, 'RWF', 15000000, 'RWF', 1);

    -- RW-JE-002: Monthly Payroll — National Staff
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 2, 'Monthly Payroll — Rwanda National Staff', 'رواتب الموظفين الوطنيين — رواندا', 'payroll', 'posted', 'sample-rw-je-002', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, rw_salary,      v_fund_id, 'mng',   'DR', 8500000,  'RWF', 8500000,  'RWF', 1),
      (v_entry_id, 2, rw_rssb,        v_fund_id, 'mng',   'DR', 765000,   'RWF', 765000,   'RWF', 1),
      (v_entry_id, 3, rw_accrued_pay, v_fund_id, 'mng',   'CR', 9265000,  'RWF', 9265000,  'RWF', 1);

    -- RW-JE-003: Office Rent — Kigali Q1
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 3, 'Office Rent — Kigali January', 'إيجار مكتب كيغالي يناير', 'manual', 'posted', 'sample-rw-je-003', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, rw_rent,       v_fund_id, 'mng',   'DR', 1200000, 'RWF', 1200000, 'RWF', 1),
      (v_entry_id, 2, rw_ap_vendor,  v_fund_id, 'mng',   'CR', 1200000, 'RWF', 1200000, 'RWF', 1);

    -- RW-JE-004: Indirect Cost Charge
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 4, 'Indirect Cost Rate Charge — Rwanda Q1', 'رسوم معدل التكاليف غير المباشرة — رواندا', 'manual', 'posted', 'sample-rw-je-004', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, rw_idc,         v_fund_id, 'mng', 'DR', 2550000, 'RWF', 2550000, 'RWF', 1),
      (v_entry_id, 2, rw_net_unrest,  v_fund_id, 'mng', 'CR', 2550000, 'RWF', 2550000, 'RWF', 1);

    -- RW-JE-005: Training Workshop — Beneficiaries
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 5, 'Farmers Training Workshop — Southern Province', 'ورشة تدريب المزارعين — المقاطعة الجنوبية', 'program', 'posted', 'sample-rw-je-005', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, rw_training,   v_fund_id, 'program', 'DR', 3800000, 'RWF', 3800000, 'RWF', 1),
      (v_entry_id, 2, rw_ap_vendor,  v_fund_id, 'program', 'CR', 3800000, 'RWF', 3800000, 'RWF', 1);

    RAISE NOTICE 'Rwanda: 5 journal entries created.';
    END IF; -- close COA-accounts guard
  ELSE
    RAISE WARNING 'Rwanda country not found; skipping Rwanda entries.';
  END IF;

  -- ================================================================
  -- ██████████  QATAR  ██████████
  -- ================================================================
  IF id_qa IS NOT NULL THEN
    SELECT id INTO qa_cash       FROM acct_accounts WHERE code = 'QA-1101' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_bank       FROM acct_accounts WHERE code = 'QA-1102' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_grant_recv FROM acct_accounts WHERE code = 'QA-1201' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_grant_rev  FROM acct_accounts WHERE code = 'QA-4101' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_salary     FROM acct_accounts WHERE code = 'QA-5101' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_eos        FROM acct_accounts WHERE code = 'QA-2202' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_ap_vendor  FROM acct_accounts WHERE code = 'QA-2101' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_accrued_pay FROM acct_accounts WHERE code = 'QA-2201' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_travel_int FROM acct_accounts WHERE code = 'QA-5202' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_training   FROM acct_accounts WHERE code = 'QA-5302' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_rent       FROM acct_accounts WHERE code = 'QA-5401' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_idc        FROM acct_accounts WHERE code = 'QA-5501' AND country_id = id_qa LIMIT 1;
    SELECT id INTO qa_net_unrest FROM acct_accounts WHERE code = 'QA-3001' AND country_id = id_qa LIMIT 1;

    IF qa_bank IS NULL OR qa_grant_rev IS NULL OR qa_salary IS NULL THEN
      RAISE WARNING 'Qatar COA accounts not found. Run coa_rw_qa_us_ke_migration.sql first. Skipping Qatar entries.';
    ELSE

    -- QA-JE-001: USAID Grant Receipt — Doha
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 1, 'USAID Grant Receipt — Doha Office', 'استلام منحة USAID — مكتب الدوحة', 'manual', 'posted', 'sample-qa-je-001', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, qa_bank,      v_fund_id, 'program', 'DR', 250000, 'QAR', 250000, 'QAR', 1),
      (v_entry_id, 2, qa_grant_rev, v_fund_id, 'program', 'CR', 250000, 'QAR', 250000, 'QAR', 1);

    -- QA-JE-002: Staff Payroll — Doha
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 2, 'Monthly Payroll — Qatar Staff', 'الرواتب الشهرية — موظفو قطر', 'payroll', 'posted', 'sample-qa-je-002', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, qa_salary,      v_fund_id, 'mng',   'DR', 45000,  'QAR', 45000,  'QAR', 1),
      (v_entry_id, 2, qa_eos,         v_fund_id, 'mng',   'DR', 3750,   'QAR', 3750,   'QAR', 1),
      (v_entry_id, 3, qa_accrued_pay, v_fund_id, 'mng',   'CR', 48750,  'QAR', 48750,  'QAR', 1);

    -- QA-JE-003: Office Rent — Doha
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 3, 'Office Rent — Doha January', 'إيجار مكتب الدوحة يناير', 'manual', 'posted', 'sample-qa-je-003', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, qa_rent,      v_fund_id, 'mng',   'DR', 18000, 'QAR', 18000, 'QAR', 1),
      (v_entry_id, 2, qa_ap_vendor, v_fund_id, 'mng',   'CR', 18000, 'QAR', 18000, 'QAR', 1);

    -- QA-JE-004: GCC Humanitarian Training Event
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 4, 'GCC Humanitarian Coordination Training — Doha', 'تدريب التنسيق الإنساني الخليجي — الدوحة', 'program', 'posted', 'sample-qa-je-004', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, qa_training,  v_fund_id, 'program', 'DR', 32000, 'QAR', 32000, 'QAR', 1),
      (v_entry_id, 2, qa_ap_vendor, v_fund_id, 'program', 'CR', 32000, 'QAR', 32000, 'QAR', 1);

    -- QA-JE-005: Indirect Cost Charge
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 5, 'Indirect Cost Rate Charge — Qatar Q1', 'رسوم معدل التكاليف غير المباشرة — قطر', 'manual', 'posted', 'sample-qa-je-005', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, qa_idc,        v_fund_id, 'mng', 'DR', 13500, 'QAR', 13500, 'QAR', 1),
      (v_entry_id, 2, qa_net_unrest, v_fund_id, 'mng', 'CR', 13500, 'QAR', 13500, 'QAR', 1);

    RAISE NOTICE 'Qatar: 5 journal entries created.';
    END IF; -- close COA-accounts guard
  ELSE
    RAISE WARNING 'Qatar country not found; skipping Qatar entries.';
  END IF;

  -- ================================================================
  -- ██████████  USA  ██████████
  -- ================================================================
  IF id_us IS NOT NULL THEN
    SELECT id INTO us_bank_op    FROM acct_accounts WHERE code = 'US-1102' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_bank_pay   FROM acct_accounts WHERE code = 'US-1103' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_fed_recv   FROM acct_accounts WHERE code = 'US-1201' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_usaid_rev  FROM acct_accounts WHERE code = 'US-4101' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_salary_ex  FROM acct_accounts WHERE code = 'US-5101' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_health     FROM acct_accounts WHERE code = 'US-5201' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_fica_oasdi FROM acct_accounts WHERE code = 'US-5203' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_ap_vendor  FROM acct_accounts WHERE code = 'US-2101' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_accrued_pay FROM acct_accounts WHERE code = 'US-2201' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_def_grant  FROM acct_accounts WHERE code = 'US-2301' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_dom_travel FROM acct_accounts WHERE code = 'US-5301' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_training   FROM acct_accounts WHERE code = 'US-5402' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_rent       FROM acct_accounts WHERE code = 'US-5501' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_nicra      FROM acct_accounts WHERE code = 'US-5601' AND country_id = id_us LIMIT 1;
    SELECT id INTO us_net_donor  FROM acct_accounts WHERE code = 'US-3001' AND country_id = id_us LIMIT 1;

    IF us_bank_op IS NULL OR us_usaid_rev IS NULL OR us_salary_ex IS NULL THEN
      RAISE WARNING 'USA COA accounts not found. Run coa_rw_qa_us_ke_migration.sql first. Skipping USA entries.';
    ELSE

    -- US-JE-001: USAID Prime Award — Cash Draw-Down
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 1, 'USAID Prime Award Draw-Down — Washington DC HQ', 'سحب منحة USAID الرئيسية — المقر الرئيسي واشنطن', 'manual', 'posted', 'sample-us-je-001', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_bank_op,  v_fund_id, 'program', 'DR', 850000.00, 'USD', 850000.00, 'USD', 1),
      (v_entry_id, 2, us_usaid_rev, v_fund_id, 'program', 'CR', 850000.00, 'USD', 850000.00, 'USD', 1);

    -- US-JE-002: Payroll — Exempt + Fringe
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 2, 'HQ Payroll — Exempt Staff + Fringe Benefits', 'رواتب الموظفين المعفيين والمزايا الإضافية — المقر', 'payroll', 'posted', 'sample-us-je-002', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_salary_ex,  v_fund_id, 'mng',   'DR', 92000.00, 'USD', 92000.00, 'USD', 1),
      (v_entry_id, 2, us_health,     v_fund_id, 'mng',   'DR', 9200.00,  'USD', 9200.00,  'USD', 1),
      (v_entry_id, 3, us_fica_oasdi, v_fund_id, 'mng',   'DR', 5704.00,  'USD', 5704.00,  'USD', 1),
      (v_entry_id, 4, us_accrued_pay, v_fund_id, 'mng',    'CR', 106904.00,'USD', 106904.00,'USD', 1);

    -- US-JE-003: Office Rent + Occupancy — DC
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 3, 'HQ Office Rent & Occupancy — January', 'إيجار مكتب المقر الرئيسي والإشغال يناير', 'manual', 'posted', 'sample-us-je-003', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_rent,      v_fund_id, 'mng',   'DR', 28000.00, 'USD', 28000.00, 'USD', 1),
      (v_entry_id, 2, us_ap_vendor, v_fund_id, 'mng',   'CR', 28000.00, 'USD', 28000.00, 'USD', 1);

    -- US-JE-004: NICRA Indirect Cost Charge
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 4, 'NICRA Indirect Cost Rate Charge — USAID Award', 'رسوم معدل التكاليف غير المباشرة NICRA — منحة USAID', 'manual', 'posted', 'sample-us-je-004', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_nicra,       v_fund_id, 'mng', 'DR', 51000.00, 'USD', 51000.00, 'USD', 1),
      (v_entry_id, 2, us_net_donor,   v_fund_id, 'mng', 'CR', 51000.00, 'USD', 51000.00, 'USD', 1);

    -- US-JE-005: Deferred Revenue Recognition — CDC Grant
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 5, 'Deferred CDC Grant Revenue Recognition — January', 'الاعتراف بإيرادات منحة CDC المؤجلة يناير', 'manual', 'posted', 'sample-us-je-005', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_def_grant,  v_fund_id, 'program', 'DR', 120000.00, 'USD', 120000.00, 'USD', 1),
      (v_entry_id, 2, us_usaid_rev,  v_fund_id, 'program', 'CR', 120000.00, 'USD', 120000.00, 'USD', 1);

    -- US-JE-006: Staff Training — Program
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 6, 'Partner Capacity Building Training — Quarterly', 'تدريب بناء قدرات الشركاء — ربع سنوي', 'program', 'posted', 'sample-us-je-006', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, us_training,  v_fund_id, 'program', 'DR', 45000.00, 'USD', 45000.00, 'USD', 1),
      (v_entry_id, 2, us_ap_vendor, v_fund_id, 'program', 'CR', 45000.00, 'USD', 45000.00, 'USD', 1);

    RAISE NOTICE 'USA: 6 journal entries created.';
    END IF; -- close COA-accounts guard
  ELSE
    RAISE WARNING 'USA country not found; skipping USA entries.';
  END IF;

  -- ================================================================
  -- ██████████  KENYA  ██████████
  -- ================================================================
  IF id_ke IS NOT NULL THEN
    SELECT id INTO ke_cash       FROM acct_accounts WHERE code = 'KE-1101' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_mpesa      FROM acct_accounts WHERE code = 'KE-1105' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_grant_recv FROM acct_accounts WHERE code = 'KE-1201' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_usaid_rev  FROM acct_accounts WHERE code = 'KE-4101' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_salary     FROM acct_accounts WHERE code = 'KE-5101' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_nhif       FROM acct_accounts WHERE code = 'KE-5105' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_nssf       FROM acct_accounts WHERE code = 'KE-5104' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_paye       FROM acct_accounts WHERE code = 'KE-2204' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_ap_vendor  FROM acct_accounts WHERE code = 'KE-2101' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_accrued_pay FROM acct_accounts WHERE code = 'KE-2201' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_travel_int FROM acct_accounts WHERE code = 'KE-5202' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_training   FROM acct_accounts WHERE code = 'KE-5302' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_rent       FROM acct_accounts WHERE code = 'KE-5401' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_idc        FROM acct_accounts WHERE code = 'KE-5601' AND country_id = id_ke LIMIT 1;
    SELECT id INTO ke_net_unrest FROM acct_accounts WHERE code = 'KE-3001' AND country_id = id_ke LIMIT 1;

    -- Guard: if key accounts are missing the Kenya COA hasn't been applied yet
    IF ke_grant_recv IS NULL OR ke_usaid_rev IS NULL OR ke_salary IS NULL THEN
      RAISE WARNING 'Kenya COA accounts not found (KE-1201, KE-4101, KE-5101). '
        'Run coa_rw_qa_us_ke_migration.sql first, then re-run this script. Skipping Kenya entries.';
    ELSE

    -- KE-JE-001: USAID Grant Receipt — Nairobi
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 1, 'USAID Grant Receipt — Nairobi Office Q1', 'استلام منحة USAID — مكتب نيروبي الربع الأول', 'manual', 'posted', 'sample-ke-je-001', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_grant_recv, v_fund_id, 'program', 'DR', 4500000, 'KES', 4500000, 'KES', 1),
      (v_entry_id, 2, ke_usaid_rev,  v_fund_id, 'program', 'CR', 4500000, 'KES', 4500000, 'KES', 1);

    -- KE-JE-002: Monthly Payroll with NHIF + NSSF + PAYE
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 2, 'Monthly Payroll — Kenya Staff (NHIF + NSSF + PAYE)', 'الرواتب الشهرية للموظفين كينيا (NHIF + NSSF + PAYE)', 'payroll', 'posted', 'sample-ke-je-002', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_salary,      v_fund_id, 'mng',   'DR', 620000, 'KES', 620000, 'KES', 1),
      (v_entry_id, 2, ke_nhif,        v_fund_id, 'mng',   'DR', 31000,  'KES', 31000,  'KES', 1),
      (v_entry_id, 3, ke_nssf,        v_fund_id, 'mng',   'DR', 12400,  'KES', 12400,  'KES', 1),
      (v_entry_id, 4, ke_accrued_pay, v_fund_id, 'mng',   'CR', 525200, 'KES', 525200, 'KES', 1),
      (v_entry_id, 5, ke_paye,        v_fund_id, 'mng',   'CR', 138200, 'KES', 138200, 'KES', 1);

    -- KE-JE-003: M-Pesa Disbursement — Beneficiaries
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 3, 'M-Pesa Cash Transfer to Beneficiaries — Turkana', 'تحويل M-Pesa النقدي للمستفيدين — توركانا', 'program', 'posted', 'sample-ke-je-003', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_training, v_fund_id, 'program', 'DR', 750000, 'KES', 750000, 'KES', 1),
      (v_entry_id, 2, ke_mpesa,    v_fund_id, 'program', 'CR', 750000, 'KES', 750000, 'KES', 1);

    -- KE-JE-004: Office Rent — Nairobi
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 4, 'Office Rent — Nairobi Westlands January', 'إيجار مكتب نيروبي ويستلاندز يناير', 'manual', 'posted', 'sample-ke-je-004', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_rent,      v_fund_id, 'mng',   'DR', 180000, 'KES', 180000, 'KES', 1),
      (v_entry_id, 2, ke_ap_vendor, v_fund_id, 'mng',   'CR', 180000, 'KES', 180000, 'KES', 1);

    -- KE-JE-005: Indirect Cost Charge — Kenya
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 5, 'Indirect Cost Rate Charge — Kenya Q1', 'رسوم معدل التكاليف غير المباشرة — كينيا', 'manual', 'posted', 'sample-ke-je-005', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_idc,        v_fund_id, 'mng', 'DR', 186000, 'KES', 186000, 'KES', 1),
      (v_entry_id, 2, ke_net_unrest, v_fund_id, 'mng', 'CR', 186000, 'KES', 186000, 'KES', 1);

    -- KE-JE-006: Field Trip — Mombasa Site Visit
    INSERT INTO acct_journal_entries (period_id, posting_date, description_en, description_ar, source_type, status, idempotency_key, posted_at, created_by, posted_by)
    VALUES (v_period_id, v_period_date + 6, 'Field Site Visit — Mombasa Coastal Program', 'زيارة موقع ميداني — برنامج الساحل مومباسا', 'site_visit', 'posted', 'sample-ke-je-006', NOW(), v_admin_id, v_admin_id)
    RETURNING id INTO v_entry_id;
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, function, debit_credit, functional_amount, functional_currency, original_amount, original_currency, fx_rate)
    VALUES
      (v_entry_id, 1, ke_travel_int, v_fund_id, 'program', 'DR', 95000, 'KES', 95000, 'KES', 1),
      (v_entry_id, 2, ke_cash,       v_fund_id, 'program', 'CR', 95000, 'KES', 95000, 'KES', 1);

    RAISE NOTICE 'Kenya: 6 journal entries created.';
    END IF; -- close COA-accounts guard
  ELSE
    RAISE WARNING 'Kenya country not found; skipping Kenya entries.';
  END IF;

  RAISE NOTICE 'Sample journal entries seeding complete. Period used: %', v_period_id;

END $$;

-- ── Verification query ────────────────────────────────────────
-- After running, check counts per country:
/*
SELECT
  c.flag_emoji,
  c.name_en,
  COUNT(DISTINCT je.id) AS journal_entries,
  COUNT(jl.id)          AS journal_lines
FROM acct_journal_entries je
JOIN acct_journal_lines jl ON jl.entry_id = je.id
JOIN acct_accounts a ON a.id = jl.account_id
JOIN countries c ON c.id = a.country_id
WHERE je.idempotency_key LIKE 'sample-%'
GROUP BY c.flag_emoji, c.name_en
ORDER BY c.name_en;
*/
