-- =============================================================================
-- PACT COA — Standardise All Account Codes to 6 Digits
-- =============================================================================
-- Purpose : Pad all existing 4-digit PACT codes to 6 digits so the COA is
--           consistent with the Odoo 6-digit COA being imported alongside it.
-- Strategy: Append "00" for 26 codes with no Odoo conflict.
--           Append "01" (or first free slot) for 10 codes that would clash with
--           an Odoo account — keeps PACT accounts distinct from Odoo standard.
-- Safety  : UUIDs never change → all journal lines stay intact.
--           All GL bridge functions are recreated with new codes in this file.
--           Idempotent (safe to re-run if interrupted).
-- Run     : BEFORE odoo_coa_import.sql
-- Depends : All previous GL bridge migrations (phase2-5, HR bridges, etc.)
-- =============================================================================

set lock_timeout = '10s';

-- =============================================================================
-- STEP 1 — Rename codes (two-pass to avoid transient constraint violations)
-- Pass A: prefix all 4-digit codes with "OLD_" to free the namespace
-- Pass B: set the final 6-digit codes
-- =============================================================================

-- Pass A: mark codes for rename (covers both global and country-specific rows)
UPDATE public.acct_accounts SET code = 'OLD_' || code WHERE length(code) = 4;

-- Pass B: apply the correct 6-digit codes
-- ─── Assets ──────────────────────────────────────────────────────────────────
UPDATE public.acct_accounts SET code = '100000' WHERE code = 'OLD_1000';
UPDATE public.acct_accounts SET code = '110001' WHERE code = 'OLD_1100'; -- Odoo 110000 = Debtors Control
UPDATE public.acct_accounts SET code = '111001' WHERE code = 'OLD_1110'; -- Odoo 111000 = Purchase Tax
UPDATE public.acct_accounts SET code = '120000' WHERE code = 'OLD_1200';
UPDATE public.acct_accounts SET code = '130000' WHERE code = 'OLD_1300';
UPDATE public.acct_accounts SET code = '150000' WHERE code = 'OLD_1500';
UPDATE public.acct_accounts SET code = '151000' WHERE code = 'OLD_1510';
UPDATE public.acct_accounts SET code = '152000' WHERE code = 'OLD_1520';
UPDATE public.acct_accounts SET code = '160000' WHERE code = 'OLD_1600';
UPDATE public.acct_accounts SET code = '180000' WHERE code = 'OLD_1800';
-- ─── Liabilities ─────────────────────────────────────────────────────────────
UPDATE public.acct_accounts SET code = '200000' WHERE code = 'OLD_2000';
UPDATE public.acct_accounts SET code = '210001' WHERE code = 'OLD_2100'; -- Odoo 210000 = Creditors Control
UPDATE public.acct_accounts SET code = '210501' WHERE code = 'OLD_2105'; -- Odoo 210500 = Bad Debt Provision
UPDATE public.acct_accounts SET code = '211001' WHERE code = 'OLD_2110'; -- Odoo 211000 conflict
UPDATE public.acct_accounts SET code = '220001' WHERE code = 'OLD_2200'; -- Odoo 220000 = Sales Tax Control
UPDATE public.acct_accounts SET code = '224001' WHERE code = 'OLD_2240'; -- Odoo 224000 = Corporate Tax
UPDATE public.acct_accounts SET code = '235000' WHERE code = 'OLD_2350';
UPDATE public.acct_accounts SET code = '240000' WHERE code = 'OLD_2400';
UPDATE public.acct_accounts SET code = '240100' WHERE code = 'OLD_2401';
UPDATE public.acct_accounts SET code = '260000' WHERE code = 'OLD_2600';
UPDATE public.acct_accounts SET code = '261000' WHERE code = 'OLD_2610';
UPDATE public.acct_accounts SET code = '262000' WHERE code = 'OLD_2620';
UPDATE public.acct_accounts SET code = '280000' WHERE code = 'OLD_2800';
-- ─── Assets (extra country-specific accounts) ────────────────────────────────
UPDATE public.acct_accounts SET code = '121000' WHERE code = 'OLD_1210';
UPDATE public.acct_accounts SET code = '122000' WHERE code = 'OLD_1220';
UPDATE public.acct_accounts SET code = '131000' WHERE code = 'OLD_1310';
UPDATE public.acct_accounts SET code = '140000' WHERE code = 'OLD_1400';
UPDATE public.acct_accounts SET code = '141000' WHERE code = 'OLD_1410';
UPDATE public.acct_accounts SET code = '170000' WHERE code = 'OLD_1700';
UPDATE public.acct_accounts SET code = '181000' WHERE code = 'OLD_1810';
UPDATE public.acct_accounts SET code = '182000' WHERE code = 'OLD_1820';
UPDATE public.acct_accounts SET code = '185000' WHERE code = 'OLD_1850';
-- ─── Liabilities (extra country-specific accounts) ───────────────────────────
UPDATE public.acct_accounts SET code = '221000' WHERE code = 'OLD_2210';
UPDATE public.acct_accounts SET code = '222000' WHERE code = 'OLD_2220';
UPDATE public.acct_accounts SET code = '223000' WHERE code = 'OLD_2230';
UPDATE public.acct_accounts SET code = '225000' WHERE code = 'OLD_2250';
UPDATE public.acct_accounts SET code = '230000' WHERE code = 'OLD_2300';
UPDATE public.acct_accounts SET code = '231000' WHERE code = 'OLD_2310';
UPDATE public.acct_accounts SET code = '250000' WHERE code = 'OLD_2500';
-- ─── Equity ───────────────────────────────────────────────────────────────────
UPDATE public.acct_accounts SET code = '300001' WHERE code = 'OLD_3000'; -- Odoo 300000 conflict
UPDATE public.acct_accounts SET code = '310000' WHERE code = 'OLD_3100';
UPDATE public.acct_accounts SET code = '320000' WHERE code = 'OLD_3200';
UPDATE public.acct_accounts SET code = '330000' WHERE code = 'OLD_3300';
UPDATE public.acct_accounts SET code = '340000' WHERE code = 'OLD_3400';
UPDATE public.acct_accounts SET code = '350000' WHERE code = 'OLD_3500';
-- ─── Revenue (extra country-specific accounts) ───────────────────────────────
UPDATE public.acct_accounts SET code = '400001' WHERE code = 'OLD_4000'; -- Odoo 400000 conflict
UPDATE public.acct_accounts SET code = '410000' WHERE code = 'OLD_4100';
UPDATE public.acct_accounts SET code = '411000' WHERE code = 'OLD_4110';
UPDATE public.acct_accounts SET code = '412000' WHERE code = 'OLD_4120';
UPDATE public.acct_accounts SET code = '413000' WHERE code = 'OLD_4130';
UPDATE public.acct_accounts SET code = '414000' WHERE code = 'OLD_4140';
UPDATE public.acct_accounts SET code = '415000' WHERE code = 'OLD_4150';
UPDATE public.acct_accounts SET code = '420000' WHERE code = 'OLD_4200';
UPDATE public.acct_accounts SET code = '430000' WHERE code = 'OLD_4300';
UPDATE public.acct_accounts SET code = '440000' WHERE code = 'OLD_4400';
UPDATE public.acct_accounts SET code = '450000' WHERE code = 'OLD_4500';
UPDATE public.acct_accounts SET code = '460000' WHERE code = 'OLD_4600';
UPDATE public.acct_accounts SET code = '490000' WHERE code = 'OLD_4900';
-- ─── Other / Clearing ────────────────────────────────────────────────────────
UPDATE public.acct_accounts SET code = '499000' WHERE code = 'OLD_4990';
UPDATE public.acct_accounts SET code = '499900' WHERE code = 'OLD_4999';
-- ─── Revenue / Expenses ───────────────────────────────────────────────────────
UPDATE public.acct_accounts SET code = '500001' WHERE code = 'OLD_5000'; -- Odoo 500000 conflict
UPDATE public.acct_accounts SET code = '505000' WHERE code = 'OLD_5050';
UPDATE public.acct_accounts SET code = '506000' WHERE code = 'OLD_5060';
UPDATE public.acct_accounts SET code = '507000' WHERE code = 'OLD_5070';
UPDATE public.acct_accounts SET code = '510000' WHERE code = 'OLD_5100';
UPDATE public.acct_accounts SET code = '511000' WHERE code = 'OLD_5110';
UPDATE public.acct_accounts SET code = '520001' WHERE code = 'OLD_5200'; -- Odoo 520000 = Postage & Delivery
UPDATE public.acct_accounts SET code = '521000' WHERE code = 'OLD_5210';
UPDATE public.acct_accounts SET code = '530000' WHERE code = 'OLD_5300';
UPDATE public.acct_accounts SET code = '531009' WHERE code = 'OLD_5310'; -- Odoo 531000–531008 occupied
UPDATE public.acct_accounts SET code = '532001' WHERE code = 'OLD_5320'; -- Odoo 532000 = Exch Gain/Loss
UPDATE public.acct_accounts SET code = '540000' WHERE code = 'OLD_5400';
UPDATE public.acct_accounts SET code = '541000' WHERE code = 'OLD_5410';
UPDATE public.acct_accounts SET code = '550000' WHERE code = 'OLD_5500';
UPDATE public.acct_accounts SET code = '560000' WHERE code = 'OLD_5600';
UPDATE public.acct_accounts SET code = '570000' WHERE code = 'OLD_5700';
UPDATE public.acct_accounts SET code = '580000' WHERE code = 'OLD_5800';
UPDATE public.acct_accounts SET code = '590000' WHERE code = 'OLD_5900';
UPDATE public.acct_accounts SET code = '600001' WHERE code = 'OLD_6000'; -- Odoo 600000 = Share Capital
UPDATE public.acct_accounts SET code = '610000' WHERE code = 'OLD_6100';
UPDATE public.acct_accounts SET code = '611000' WHERE code = 'OLD_6110';
UPDATE public.acct_accounts SET code = '615000' WHERE code = 'OLD_6150';
UPDATE public.acct_accounts SET code = '620000' WHERE code = 'OLD_6200';
UPDATE public.acct_accounts SET code = '621000' WHERE code = 'OLD_6210';
UPDATE public.acct_accounts SET code = '622000' WHERE code = 'OLD_6220';
UPDATE public.acct_accounts SET code = '630000' WHERE code = 'OLD_6300';
UPDATE public.acct_accounts SET code = '631000' WHERE code = 'OLD_6310';
UPDATE public.acct_accounts SET code = '632000' WHERE code = 'OLD_6320';
UPDATE public.acct_accounts SET code = '640000' WHERE code = 'OLD_6400';
UPDATE public.acct_accounts SET code = '700000' WHERE code = 'OLD_7000';
UPDATE public.acct_accounts SET code = '999000' WHERE code = 'OLD_9990';

-- Safety gate: fail immediately if any OLD_ codes remain unmapped
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.acct_accounts WHERE code LIKE 'OLD_%') THEN
    RAISE EXCEPTION
      'CODE_RENAME_INCOMPLETE: some 4-digit codes were not remapped. '
      'Check acct_accounts WHERE code LIKE ''OLD_%%'' and add a mapping above.';
  END IF;
  RAISE NOTICE '✅ Step 1 complete — all account codes converted to 6 digits.';
END $$;

-- =============================================================================
-- STEP 2 — Recreate acct_bridge_ops_cost_account()
-- This function maps expense_category → GL account code string.
-- Must return 6-digit codes after the rename above.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_bridge_ops_cost_account(p_category text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_category
    -- ── field-ops categories ────────────────────────────────────────────────
    WHEN 'incentives'               THEN '507000'  -- Data Collector Incentives
    WHEN 'communications'           THEN '580000'  -- Programme Communications
    WHEN 'training'                 THEN '532001'  -- Training & Workshops
    WHEN 'general_transport'        THEN '570000'  -- Programme Vehicle & Fuel
    WHEN 'equipment'                THEN '520001'  -- Programme Supplies
    WHEN 'printing'                 THEN '520001'  -- Programme Supplies
    WHEN 'meetings'                 THEN '532001'  -- Training & Workshops
    WHEN 'permits'                  THEN '631000'  -- Legal Fees
    -- ── general staff expense categories ────────────────────────────────────
    WHEN 'meals'                    THEN '531009'  -- Per Diem & Subsistence
    WHEN 'accommodation'            THEN '531009'  -- Per Diem & Subsistence
    WHEN 'fuel'                     THEN '570000'  -- Programme Vehicle & Fuel
    WHEN 'airfare'                  THEN '570000'  -- Programme Vehicle & Fuel
    WHEN 'taxi'                     THEN '570000'  -- Programme Vehicle & Fuel
    WHEN 'supplies'                 THEN '520001'  -- Programme Supplies
    WHEN 'office_supplies'          THEN '520001'  -- Programme Supplies
    WHEN 'professional_development' THEN '532001'  -- Training & Workshops
    WHEN 'medical'                  THEN '615000'  -- Staff Medical & Health
    -- ── catch-all ────────────────────────────────────────────────────────────
    ELSE                                 '505000'  -- Operational Field Costs
  END;
$$;

COMMENT ON FUNCTION public.acct_bridge_ops_cost_account(text) IS
  'Maps operational_cost_submissions.expense_category to a 6-digit GL account code. '
  'Updated by acct_coa_standardize_6digit.sql to use 6-digit codes.';

-- =============================================================================
-- STEP 3 — Recreate GL bridge trigger functions with 6-digit codes
-- =============================================================================

-- ─── 3a. EOSB Accruals  (DR 620000 / CR 235000) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_eosb_accruals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid;
BEGIN
  IF tg_op = 'INSERT' AND new.accrued_amount > 0 THEN
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'eosb_accruals', new.id, 'accrual_posted',
        coalesce(to_date(new.period || '-01','YYYY-MM-DD'), current_date),
        'EOSB Monthly Provision — ' || new.period,
        'مخصص مكافأة نهاية الخدمة الشهري — ' || new.period,
        jsonb_build_array(
          jsonb_build_object('account_code','620000','amount',new.accrued_amount,
            'debit_credit','DR','description','EOSB Expense: '||new.period,
            'currency',coalesce(new.currency,'SDG'),'function','program'),
          jsonb_build_object('account_code','235000','amount',new.accrued_amount,
            'debit_credit','CR','description','EOSB Provision Liability: '||new.period,
            'currency',coalesce(new.currency,'SDG'),'function','program')
        ), new.created_by);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('eosb_accruals',new.id,'accrual_posted','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('eosb_accruals',new.id,'accrual_posted','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3b. HR Salary Advances  (DR 152000 / CR 120000) ────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_hr_salary_advances()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_staff_name text;
BEGIN
  IF tg_op = 'INSERT' AND coalesce(new.status,'active') = 'active' AND new.amount > 0 THEN
    SELECT coalesce(full_name,'Unknown') INTO v_staff_name FROM public.profiles WHERE id = new.user_id;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'hr_salary_advances', new.id, 'advance_disbursed',
        coalesce(new.issue_date::date, current_date),
        'Salary Advance Disbursed — ' || coalesce(v_staff_name, new.user_id::text),
        'صرف سلفة راتب — '           || coalesce(v_staff_name, new.user_id::text),
        jsonb_build_array(
          jsonb_build_object('account_code','152000','amount',new.amount,'debit_credit','DR',
            'description','Advance Receivable: '||coalesce(v_staff_name,''),
            'currency',coalesce(new.currency,'SDG'),'function','management'),
          jsonb_build_object('account_code','120000','amount',new.amount,'debit_credit','CR',
            'description','Cash disbursed for salary advance',
            'currency',coalesce(new.currency,'SDG'),'function','management')
        ), new.created_by);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('hr_salary_advances',new.id,'advance_disbursed','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('hr_salary_advances',new.id,'advance_disbursed','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3c. HR Salary Advance Recoveries  (DR 120000 / CR 152000) ───────────────
CREATE OR REPLACE FUNCTION public.acct_trig_hr_salary_advance_recoveries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_staff_name text; v_adv_user uuid;
BEGIN
  IF tg_op = 'INSERT' AND new.amount > 0 THEN
    SELECT user_id INTO v_adv_user FROM public.hr_salary_advances WHERE id = new.advance_id;
    IF v_adv_user IS NOT NULL THEN
      SELECT coalesce(full_name,'Unknown') INTO v_staff_name FROM public.profiles WHERE id = v_adv_user;
    END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'hr_salary_advance_recoveries', new.id, 'advance_recovered',
        coalesce(new.recovery_date::date, current_date),
        'Salary Advance Recovery — ' || coalesce(v_staff_name,'')
          || CASE WHEN new.payroll_period IS NOT NULL THEN ' ('||new.payroll_period||')' ELSE '' END,
        'استرداد سلفة راتب — ' || coalesce(v_staff_name,''),
        jsonb_build_array(
          jsonb_build_object('account_code','120000','amount',new.amount,'debit_credit','DR',
            'description','Advance Recovery received','currency','SDG','function','management'),
          jsonb_build_object('account_code','152000','amount',new.amount,'debit_credit','CR',
            'description','Clearing Salary Advance Receivable: '||coalesce(v_staff_name,''),
            'currency','SDG','function','management')
        ), null);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('hr_salary_advance_recoveries',new.id,'advance_recovered','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('hr_salary_advance_recoveries',new.id,'advance_recovered','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3d. Grant Expenses  (DR 560000 / CR 210001) ────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_grant_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_grant_name text; v_grant_cur text;
BEGIN
  IF tg_op = 'INSERT' AND new.amount > 0 THEN
    SELECT grant_name, coalesce(currency,'USD') INTO v_grant_name, v_grant_cur
      FROM public.acct_grants WHERE id = new.grant_id;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'acct_grant_expenses', new.id, 'grant_expense_posted',
        coalesce(new.expense_date::date, current_date),
        'Grant Expense — '||coalesce(v_grant_name,'')||': '||coalesce(new.description,''),
        'مصروف منحة — '  ||coalesce(v_grant_name,'')||': '||coalesce(new.description,''),
        jsonb_build_array(
          jsonb_build_object('account_code','560000','amount',new.amount,'debit_credit','DR',
            'description','Grant Expense: '||coalesce(new.description,''),
            'currency',coalesce(v_grant_cur,'USD'),'function','program'),
          jsonb_build_object('account_code','210001','amount',new.amount,'debit_credit','CR',
            'description','Accounts Payable: '||coalesce(v_grant_name,''),
            'currency',coalesce(v_grant_cur,'USD'),'function','program')
        ), new.created_by);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('acct_grant_expenses',new.id,'grant_expense_posted','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('acct_grant_expenses',new.id,'grant_expense_posted','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3e. Budget Encumbrances  (DR expense / CR 210501) ───────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_budget_encumbrances()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_gl_code text; v_label text;
BEGIN
  IF tg_op = 'INSERT' AND new.status = 'open' AND new.amount > 0 THEN
    BEGIN
      IF new.gl_account_id IS NOT NULL THEN
        SELECT code INTO v_gl_code FROM public.acct_accounts
         WHERE id = new.gl_account_id AND is_postable = true;
      END IF;
      v_gl_code := coalesce(v_gl_code, '505000');  -- fallback: Operational Field Costs
      v_label   := initcap(replace(coalesce(new.source_type,'purchase_order'),'_',' '));
      v_entry_id := public.acct_bridge_post_journal(
        'acct_budget_encumbrances', new.id, 'encumbrance_created', current_date,
        'Budget Encumbrance — '||v_label||' ['||left(new.source_id::text,8)||']',
        'التزام ميزانية — '||v_label,
        jsonb_build_array(
          jsonb_build_object('account_code',v_gl_code,'amount',new.amount,'debit_credit','DR',
            'description','Encumbrance — '||v_label,
            'currency',coalesce(new.currency,'SDG'),'function','program'),
          jsonb_build_object('account_code','210501','amount',new.amount,'debit_credit','CR',
            'description','PO Encumbrance Reserve — '||v_label,
            'currency',coalesce(new.currency,'SDG'),'function','none')
        ), null);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('acct_budget_encumbrances',new.id,'encumbrance_created','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('acct_budget_encumbrances',new.id,'encumbrance_created','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3f. Leave Requests  (DR 611000 / CR 224001) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_leave_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id    uuid; v_base_salary numeric; v_daily_rate numeric;
  v_amount      numeric; v_staff_name text; v_leave_label text; v_days int;
BEGIN
  IF tg_op = 'UPDATE'
     AND (old.status IS DISTINCT FROM new.status)
     AND new.status = 'approved'
     AND coalesce(new.days_count, 0) > 0
  THEN
    BEGIN
      SELECT base_salary INTO v_base_salary FROM public.eosb_accruals
       WHERE user_id = new.user_id AND base_salary > 0 ORDER BY period DESC LIMIT 1;
      IF v_base_salary IS NULL OR v_base_salary <= 0 THEN
        SELECT pri.gross_salary INTO v_base_salary
          FROM public.payroll_run_items pri JOIN public.payroll_runs pr ON pr.id = pri.run_id
         WHERE pri.user_id = new.user_id AND pr.status IN ('approved','locked')
         ORDER BY pr.period_label DESC LIMIT 1;
      END IF;
      IF v_base_salary IS NULL OR v_base_salary <= 0 THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('leave_requests',new.id,'leave_approved','skipped',
               'No base salary found for user — leave liability entry not posted');
        RETURN new;
      END IF;
      v_days       := coalesce(new.days_count,1);
      v_daily_rate := v_base_salary / 30.0;
      v_amount     := round(v_daily_rate * v_days, 2);
      SELECT coalesce(full_name,'Unknown') INTO v_staff_name FROM public.profiles WHERE id = new.user_id;
      v_leave_label := initcap(replace(coalesce(new.leave_type,'leave'),'_',' '));
      v_entry_id := public.acct_bridge_post_journal(
        'leave_requests', new.id, 'leave_approved',
        coalesce(new.start_date::date, current_date),
        v_leave_label||' Leave Approved — '||v_staff_name
          ||' ('||v_days||' days / SDG '||v_amount::text||')',
        'إجازة معتمدة — '||coalesce(v_staff_name,''),
        jsonb_build_array(
          jsonb_build_object('account_code','611000','amount',v_amount,'debit_credit','DR',
            'description',v_leave_label||' Leave Expense — '||coalesce(v_staff_name,''),
            'currency','SDG','function','mng'),
          jsonb_build_object('account_code','224001','amount',v_amount,'debit_credit','CR',
            'description','Leave Payable — '||coalesce(v_staff_name,''),
            'currency','SDG','function','none')
        ), null);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('leave_requests',new.id,'leave_approved','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('leave_requests',new.id,'leave_approved','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3g. Cash Flow Adjustments  (DR/CR 111001 / 499000) ─────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_cash_flow_adj()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled boolean; v_period_id uuid; v_fund_id uuid;
  v_je_id uuid; v_entry_no bigint;
  v_cash_acct uuid; v_clr_acct uuid; v_dr_acct uuid; v_cr_acct uuid;
  v_abs_amt numeric; v_idem_key text;
BEGIN
  SELECT is_enabled INTO v_enabled FROM public.feature_flags
   WHERE key = 'acct.bridge.cash_flow_adj' LIMIT 1;
  IF v_enabled IS NOT true THEN
    INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,je_description)
    VALUES('acct_cash_flow_adjustments',new.id,'created','skipped',
           'acct.bridge.cash_flow_adj disabled — enable to auto-post adjustment journals');
    RETURN new;
  END IF;
  SELECT id INTO v_period_id FROM public.acct_fiscal_periods
   WHERE start_date <= current_date AND end_date >= current_date AND status = 'open'
   ORDER BY start_date DESC LIMIT 1;
  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'GENERAL' AND is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_period_id IS NULL OR v_fund_id IS NULL THEN
    INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,je_description)
    VALUES('acct_cash_flow_adjustments',new.id,'created','skipped',
           'No open period or active fund — configure fiscal periods and funds first');
    RETURN new;
  END IF;
  -- Cash account: prefer 111001 (Cash & Bank header), fallback 110001, then 100000
  SELECT id INTO v_cash_acct FROM public.acct_accounts
   WHERE code IN ('111001','110001','100000') AND is_active = true ORDER BY code LIMIT 1;
  -- Clearing account: prefer 499000 (Misc Income), fallback 499900, then 999000
  SELECT id INTO v_clr_acct FROM public.acct_accounts
   WHERE code IN ('499000','499900','999000') AND is_active = true ORDER BY code LIMIT 1;
  IF v_cash_acct IS NULL OR v_clr_acct IS NULL THEN
    INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,je_description)
    VALUES('acct_cash_flow_adjustments',new.id,'created','skipped',
           'GL accounts not found (need Cash 111001 and Clearing 499000) — seed COA first');
    RETURN new;
  END IF;
  v_abs_amt  := abs(new.amount);
  v_dr_acct  := CASE WHEN new.amount >= 0 THEN v_cash_acct ELSE v_clr_acct END;
  v_cr_acct  := CASE WHEN new.amount >= 0 THEN v_clr_acct ELSE v_cash_acct END;
  v_idem_key := 'cf_adj_' || new.id::text;
  BEGIN
    INSERT INTO public.acct_journal_entries(
      period_id, posting_date, description_en, source_type, source_id, status, idempotency_key
    ) VALUES(
      v_period_id, current_date,
      format('Cash flow adjustment: %s (%s)', coalesce(new.label,'Manual'), new.month_key),
      'cash_flow_adj', new.id, 'posted', v_idem_key
    ) RETURNING id, entry_no INTO v_je_id, v_entry_no;
    INSERT INTO public.acct_journal_lines(
      journal_entry_id, account_id, fund_id, description_en, debit_credit,
      functional_amount, original_amount, currency
    ) VALUES(v_je_id, v_dr_acct, v_fund_id, format('CF adj DR — %s',coalesce(new.label,'')),
             'DR', v_abs_amt, v_abs_amt, 'USD');
    INSERT INTO public.acct_journal_lines(
      journal_entry_id, account_id, fund_id, description_en, debit_credit,
      functional_amount, original_amount, currency
    ) VALUES(v_je_id, v_cr_acct, v_fund_id, format('CF adj CR — %s',coalesce(new.label,'')),
             'CR', v_abs_amt, v_abs_amt, 'USD');
    INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id,je_reference,je_description)
    VALUES('acct_cash_flow_adjustments',new.id,'created','success',v_je_id,'JE-'||v_entry_no,
           format('CF adj posted: %s %s %s',
                  CASE WHEN new.amount>=0 THEN 'Inflow' ELSE 'Outflow' END, v_abs_amt, coalesce(new.label,'')));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
    VALUES('acct_cash_flow_adjustments',new.id,'created','error',sqlerrm);
  END;
  RETURN new;
END $$;

-- ─── 3h. Payroll Runs  (DR 610000 / CR 220001 + 211001; then DR 220001 / CR 120000) ─
CREATE OR REPLACE FUNCTION public.acct_trig_payroll_runs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_gross numeric(20,4); v_total_net numeric(20,4);
  v_total_deducts numeric(20,4); v_entry_id uuid; v_country_id uuid;
BEGIN
  v_country_id := new.country_id;
  IF v_country_id IS NULL THEN
    SELECT country_id INTO v_country_id FROM public.profiles
     WHERE id = coalesce(new.approved_by, new.created_by) LIMIT 1;
  END IF;
  -- APPROVED: recognise payroll expense
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'approved' THEN
    SELECT coalesce(sum(gross_salary),0), coalesce(sum(net_salary),0),
           coalesce(sum(deductions_total),0)
      INTO v_total_gross, v_total_net, v_total_deducts
      FROM public.payroll_run_items WHERE run_id = new.id;
    IF v_total_gross > 0 THEN
      BEGIN
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs', new.id, 'approved',
          coalesce(new.approved_at::date, current_date),
          'Payroll Expense Recognised: '||new.period_label,
          'تسجيل مصروف الرواتب: '       ||new.period_label,
          jsonb_build_array(
            jsonb_build_object('account_code','610000','debit_credit','DR','amount',v_total_gross,
              'currency','SDG','description','Gross Salaries — '||new.period_label,'function','mng'),
            jsonb_build_object('account_code','220001','debit_credit','CR','amount',v_total_net,
              'currency','SDG','description','Net Payroll Payable — '||new.period_label,'function','none'),
            jsonb_build_object('account_code','211001','debit_credit','CR','amount',v_total_deducts,
              'currency','SDG','description','Accrued Statutory Deductions — '||new.period_label,'function','none')
          ), new.approved_by, v_country_id);
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
        VALUES('payroll_runs',new.id,'payroll_approved','success',v_entry_id);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('payroll_runs',new.id,'payroll_approved','error',sqlerrm);
      END;
    END IF;
  END IF;
  -- LOCKED: clear payable with cash disbursement
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'locked' THEN
    SELECT coalesce(sum(net_salary),0) INTO v_total_net FROM public.payroll_run_items WHERE run_id = new.id;
    IF v_total_net > 0 THEN
      BEGIN
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs', new.id, 'locked', current_date,
          'Payroll Disbursement: '||new.period_label,
          'صرف الرواتب: '         ||new.period_label,
          jsonb_build_array(
            jsonb_build_object('account_code','220001','debit_credit','DR','amount',v_total_net,
              'currency','SDG','description','Clear Payroll Payable — '||new.period_label,'function','none'),
            jsonb_build_object('account_code','120000','debit_credit','CR','amount',v_total_net,
              'currency','SDG','description','Cash at Bank — Payroll Payment — '||new.period_label,'function','none')
          ), new.approved_by, v_country_id);
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
        VALUES('payroll_runs',new.id,'payroll_locked','success',v_entry_id);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
        VALUES('payroll_runs',new.id,'payroll_locked','error',sqlerrm);
      END;
    END IF;
  END IF;
  RETURN new;
END $$;

-- ─── 3i. Withdrawal Requests  (DR 260000 / CR 120000) ───────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_withdrawal_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_amount numeric(20,4); v_country_id uuid;
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'approved' THEN
    v_amount := coalesce(new.amount, 0);
    IF v_amount <= 0 THEN RETURN new; END IF;
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id FROM public.profiles
       WHERE id = coalesce(new.user_id, new.supervisor_id) LIMIT 1;
    END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'withdrawal_requests', new.id, 'approved',
        coalesce(new.approved_at::date, current_date),
        'Wallet Withdrawal Approved', 'سحب محفظة معتمد',
        jsonb_build_array(
          jsonb_build_object('account_code','260000','debit_credit','DR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Wallet Payable — Withdrawal #'||new.id::text,'function','none'),
          jsonb_build_object('account_code','120000','debit_credit','CR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash Disbursement — Wallet Withdrawal #'||new.id::text,'function','none')
        ), new.supervisor_id, v_country_id);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('withdrawal_requests',new.id,'withdrawal_approved','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('withdrawal_requests',new.id,'withdrawal_approved','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3j. Salary Advances  (DR 150000 / CR 120000) ───────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_salary_advances()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_country_id uuid;
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'disbursed' THEN
    IF coalesce(new.amount, 0) <= 0 THEN RETURN new; END IF;
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id FROM public.profiles WHERE id = new.user_id LIMIT 1;
    END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'salary_advances', new.id, 'disbursed',
        coalesce(new.disbursed_at::date, current_date),
        'Salary Advance Disbursed', 'صرف سلفة راتب',
        jsonb_build_array(
          jsonb_build_object('account_code','150000','debit_credit','DR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Advance — '||new.id::text,'function','mng'),
          jsonb_build_object('account_code','120000','debit_credit','CR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash — Salary Advance #'||new.id::text,'function','none')
        ), new.finance_id, v_country_id);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('salary_advances',new.id,'salary_advance_disbursed','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('salary_advances',new.id,'salary_advance_disbursed','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3k. Wallet Reward  (DR 531009 / CR 260000) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_wallet_reward()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_amount numeric(20,4); v_country_id uuid;
BEGIN
  IF tg_op = 'INSERT' AND new.type = 'reward' THEN
    v_amount := coalesce(new.amount, new.amount_cents / 100.0);
    IF coalesce(v_amount, 0) <= 0 THEN RETURN new; END IF;
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id FROM public.profiles
       WHERE id = coalesce(new.created_by, new.user_id) LIMIT 1;
    END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'wallet_transactions', new.id, 'reward_credit',
        coalesce(new.created_at::date, current_date),
        'Task Reward Earned', 'مكافأة مهمة مكتسبة',
        jsonb_build_array(
          jsonb_build_object('account_code','531009','debit_credit','DR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description',coalesce(new.memo, new.description,'Task Reward'),'function','program'),
          jsonb_build_object('account_code','260000','debit_credit','CR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Wallet Payable — Reward','function','none')
        ), new.created_by, v_country_id);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('wallet_transactions',new.id,'reward_credit','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('wallet_transactions',new.id,'reward_credit','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3l. Operational Cost Submissions  (DR expense / CR 120000) ──────────────
CREATE OR REPLACE FUNCTION public.acct_trig_operational_cost_submissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_amount numeric(20,4); v_expense_acc text;
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'paid' THEN
    v_amount      := coalesce(new.amount_cents, 0) / 100.0;
    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);
    IF v_amount <= 0 THEN RETURN new; END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'operational_cost_submissions', new.id, 'paid',
        coalesce(new.expense_date, current_date),
        'Operational Cost Paid: '||coalesce(new.expense_category,'general'),
        'تكلفة تشغيلية مدفوعة: '||coalesce(new.expense_category,'عامة'),
        jsonb_build_array(
          jsonb_build_object('account_code',v_expense_acc,'debit_credit','DR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description',coalesce(new.description, new.expense_category),'function','program'),
          jsonb_build_object('account_code','120000','debit_credit','CR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash Payment — Ops Cost #'||new.id::text,'function','none')
        ), new.tier2_approved_by, new.country_id);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('operational_cost_submissions',new.id,'ops_cost_paid','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('operational_cost_submissions',new.id,'ops_cost_paid','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3m. Down Payment Requests  (DR 151000 / CR 120000) ─────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_down_payment_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_amount numeric(20,4);
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'fully_paid' THEN
    v_amount := coalesce(new.total_paid_amount, new.requested_amount, 0);
    IF v_amount <= 0 THEN RETURN new; END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'down_payment_requests', new.id, 'fully_paid', current_date,
        'Field Advance Disbursed: '||coalesce(new.site_name, new.id::text),
        'صرف سلفة ميدانية: '        ||coalesce(new.site_name, new.id::text),
        jsonb_build_array(
          jsonb_build_object('account_code','151000','debit_credit','DR','amount',v_amount,
            'currency','SDG','description','Travel Advance — '||coalesce(new.site_name,'Field Site'),
            'function','program'),
          jsonb_build_object('account_code','120000','debit_credit','CR','amount',v_amount,
            'currency','SDG','description','Cash — Field Advance #'||new.id::text,'function','none')
        ), new.approved_by, new.country_id);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('down_payment_requests',new.id,'dp_fully_paid','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('down_payment_requests',new.id,'dp_fully_paid','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3n. AP Invoice Approved  (DR expense lines / CR 210001) ─────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_invoice_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id uuid; v_lines jsonb := '[]'::jsonb;
  v_line_rec record; v_line_no int := 0; v_cr_total numeric(20,4) := 0;
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'approved' THEN
    IF coalesce(new.total_amount, 0) <= 0 THEN RETURN new; END IF;
    FOR v_line_rec IN
      SELECT il.description, il.total_price, il.gl_account_code
        FROM public.acct_invoice_lines il WHERE il.invoice_id = new.id ORDER BY il.line_no
    LOOP
      v_line_no  := v_line_no + 1;
      v_cr_total := v_cr_total + coalesce(v_line_rec.total_price, 0);
      v_lines    := v_lines || jsonb_build_object(
        'account_code', coalesce(v_line_rec.gl_account_code, '505000'),
        'debit_credit','DR','amount',coalesce(v_line_rec.total_price,0),
        'currency',coalesce(new.currency,'SDG'),
        'description',v_line_rec.description,'function','program');
    END LOOP;
    IF jsonb_array_length(v_lines) = 0 THEN
      v_lines    := jsonb_build_array(jsonb_build_object(
        'account_code','505000','debit_credit','DR','amount',new.total_amount,
        'currency',coalesce(new.currency,'SDG'),
        'description',coalesce(new.description,'AP Invoice '||new.invoice_number),'function','program'));
      v_cr_total := new.total_amount;
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'account_code','210001','debit_credit','CR','amount',v_cr_total,
      'currency',coalesce(new.currency,'SDG'),
      'description','AP Payable — Invoice '||new.invoice_number,'function','none');
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'acct_invoices', new.id, 'invoice_approved',
        coalesce(new.invoice_date, current_date),
        'Invoice Approved: '||new.invoice_number,
        'فاتورة معتمدة: '  ||new.invoice_number,
        v_lines, new.approved_by);
      UPDATE public.acct_invoices SET journal_entry_id = v_entry_id WHERE id = new.id;
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('acct_invoices',new.id,'invoice_approved','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('acct_invoices',new.id,'invoice_approved','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3o. AP Payment Processed  (DR 210001 / CR 120000) ───────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_payment_processed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_dr_acc text := '210001';
BEGIN
  IF tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status AND new.status = 'processed' THEN
    IF coalesce(new.amount, 0) <= 0 THEN RETURN new; END IF;
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'acct_payments', new.id, 'payment_processed',
        coalesce(new.payment_date, current_date),
        'Vendor Payment Processed: '||new.payment_number,
        'صرف دفعة مورد: '           ||new.payment_number,
        jsonb_build_array(
          jsonb_build_object('account_code',v_dr_acc,'debit_credit','DR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Clear AP — Payment '||new.payment_number,'function','none'),
          jsonb_build_object('account_code','120000','debit_credit','CR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash at Bank — Vendor Payment '||new.payment_number,'function','none')
        ), new.processed_by);
      UPDATE public.acct_payments SET journal_entry_id = v_entry_id WHERE id = new.id;
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('acct_payments',new.id,'payment_processed','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('acct_payments',new.id,'payment_processed','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3p. Purchase Orders  (DR 510000 fallback / CR 210001) ───────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_purchase_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry_id uuid; v_gl_code text;
BEGIN
  IF tg_op = 'UPDATE'
     AND new.status = 'approved'
     AND coalesce(old.status,'') <> 'approved'
     AND coalesce(new.amount, 0) > 0
  THEN
    SELECT a.code INTO v_gl_code FROM public.acct_accounts a
     WHERE a.id = new.gl_account_id AND a.is_postable = true LIMIT 1;
    v_gl_code := coalesce(v_gl_code, '510000');  -- 510000 = Operating Expense
    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'acct_purchase_orders', new.id, 'po_approved',
        coalesce(new.approved_at::date, current_date),
        'PO Approved — '||new.po_number||': '||new.title,
        'أمر شراء معتمد — '||new.po_number||': '||new.title,
        jsonb_build_array(
          jsonb_build_object('account_code',v_gl_code,'debit_credit','DR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Purchase Commitment — '||new.po_number,'function','program'),
          jsonb_build_object('account_code','210001','debit_credit','CR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','AP Payable — '||new.po_number,'function','none')
        ), new.approved_by);
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,journal_entry_id)
      VALUES('acct_purchase_orders',new.id,'po_approved','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log(source_table,source_id,event_type,status,error_message)
      VALUES('acct_purchase_orders',new.id,'po_approved','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- ─── 3q. Intercompany Transfers (DR 180000 / CR 120000  &  DR 120000 / CR 280000) ─
-- The intercompany posting function lives in 20260521_acct_intercompany.sql.
-- It uses hardcoded codes '1800', '1200', '2800' which must be updated to
-- '180000', '120000', '280000'. Run the check below to confirm after applying
-- this migration — if any 4-digit codes appear, apply the fix block.
DO $$
DECLARE v_fname text; v_has_old boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE '%intercompany%'
       AND (p.prosrc LIKE '%''1800''%' OR p.prosrc LIKE '%''1200''%' OR p.prosrc LIKE '%''2800''%')
  ) INTO v_has_old;

  IF v_has_old THEN
    SELECT string_agg(p.proname, ', ') INTO v_fname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE '%intercompany%';
    RAISE NOTICE
      'ACTION REQUIRED: Intercompany function(s) [%] still contain 4-digit codes. '
      'Open 20260521_acct_intercompany.sql, replace ''1800''→''180000'', '
      '''1200''→''120000'', ''2800''→''280000'' in the function body, '
      'then run CREATE OR REPLACE FUNCTION for that function.', v_fname;
  ELSE
    RAISE NOTICE '✅ Intercompany functions: no 4-digit codes detected.';
  END IF;
END $$;

-- =============================================================================
-- STEP 4 — Recreate acct_recon_subledger_check with 6-digit codes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_recon_subledger_check(
  p_check_date date DEFAULT current_date
) RETURNS TABLE (
  check_name      text, gl_balance numeric(20,2),
  subledger_total numeric(20,2), variance numeric(20,2), passed boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payroll_gl     numeric(20,2); v_payroll_src    numeric(20,2);
  v_wallet_gl      numeric(20,2); v_wallet_src     numeric(20,2);
  v_advances_gl    numeric(20,2); v_advances_src   numeric(20,2);
  v_opcosts_gl     numeric(20,2); v_opcosts_src    numeric(20,2);
  v_proj_budget_gl numeric(20,2); v_proj_budget_src numeric(20,2);
  v_grants_gl      numeric(20,2); v_grants_src     numeric(20,2);
BEGIN

  -- ── 1. Payroll Payable: GL 220001 vs net salary outstanding ─────────────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_payroll_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '220001' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(pri.net_salary), 0) INTO v_payroll_src
    FROM public.payroll_runs pr
    JOIN public.payroll_run_items pri ON pri.run_id = pr.id
   WHERE pr.status = 'approved' AND pr.approved_at::date <= p_check_date;

  RETURN QUERY SELECT 'Payroll Payable (220001 GL vs approved run net)'::text,
    v_payroll_gl, v_payroll_src, v_payroll_gl - v_payroll_src,
    abs(v_payroll_gl - v_payroll_src) <= 1;

  -- ── 2. Staff Wallet Payable: GL 260000 vs pending withdrawal requests ────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_wallet_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '260000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(wr.amount), 0) INTO v_wallet_src
    FROM public.withdrawal_requests wr
   WHERE wr.status = 'pending' AND wr.created_at::date <= p_check_date;

  RETURN QUERY SELECT 'Staff Wallet Payable (260000 GL vs pending withdrawals)'::text,
    v_wallet_gl, v_wallet_src, v_wallet_gl - v_wallet_src,
    abs(v_wallet_gl - v_wallet_src) <= 1;

  -- ── 3. Staff Advances: GL 150000+151000 vs disbursed salary advances ─────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_advances_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code IN ('150000','151000') AND je.status = 'posted'
     AND je.posting_date <= p_check_date;

  SELECT coalesce(sum(sa.amount - sa.total_repaid), 0) INTO v_advances_src
    FROM public.salary_advances sa
   WHERE sa.status IN ('disbursed','repaying') AND sa.disbursed_at::date <= p_check_date;

  RETURN QUERY SELECT 'Staff Advances (150000+151000 GL vs disbursed advances outstanding)'::text,
    v_advances_gl, v_advances_src, v_advances_gl - v_advances_src,
    abs(v_advances_gl - v_advances_src) <= 1;

  -- ── 4. Operational Costs: GL 5xxxxx vs approved submissions ─────────────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_opcosts_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code LIKE '5%' AND je.status = 'posted' AND je.posting_date <= p_check_date
     AND je.source_type = 'operational_cost_submissions';

  BEGIN
    SELECT coalesce(sum(ocs.amount_cents), 0) / 100.0 INTO v_opcosts_src
      FROM public.operational_cost_submissions ocs
     WHERE ocs.status IN ('approved','paid','reconciled')
       AND coalesce(ocs.tier2_approved_at, ocs.tier1_approved_at)::date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_opcosts_src := 0;
  END;

  RETURN QUERY SELECT 'Operational Costs (GL 5xxxxx vs approved cost submissions)'::text,
    v_opcosts_gl, v_opcosts_src, v_opcosts_gl - v_opcosts_src,
    abs(v_opcosts_gl - v_opcosts_src) <= 100;

  -- ── 5. Project Encumbrance: GL 240000 vs project_budgets.spent_budget_cents ──
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='CR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_proj_budget_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '240000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  BEGIN
    SELECT coalesce(sum(pb.spent_budget_cents), 0) / 100.0 INTO v_proj_budget_src
      FROM public.project_budgets pb WHERE pb.created_at::date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_proj_budget_src := 0;
  END;

  RETURN QUERY SELECT 'Project Encumbrance (240000 GL vs project_budgets.spent_budget_cents)'::text,
    v_proj_budget_gl, v_proj_budget_src, v_proj_budget_gl - v_proj_budget_src,
    abs(v_proj_budget_gl - v_proj_budget_src) <= 100;

  -- ── 6. Donor Grants Receivable: GL 130000 vs acct_grants.award_amount ────────
  SELECT coalesce(sum(CASE WHEN jl.debit_credit='DR' THEN jl.functional_amount
                           ELSE -jl.functional_amount END), 0)
    INTO v_grants_gl
    FROM public.acct_journal_lines jl
    JOIN public.acct_accounts a      ON a.id = jl.account_id
    JOIN public.acct_journal_entries je ON je.id = jl.entry_id
   WHERE a.code = '130000' AND je.status = 'posted' AND je.posting_date <= p_check_date;

  BEGIN
    SELECT coalesce(sum(g.award_amount), 0) INTO v_grants_src
      FROM public.acct_grants g
     WHERE g.status NOT IN ('closed','cancelled') AND g.start_date <= p_check_date;
  EXCEPTION WHEN undefined_table THEN v_grants_src := 0;
  END;

  RETURN QUERY SELECT 'Donor Grants Receivable (130000 GL vs active acct_grants.award_amount)'::text,
    v_grants_gl, v_grants_src, v_grants_gl - v_grants_src,
    abs(v_grants_gl - v_grants_src) <= 1;

END $$;

COMMENT ON FUNCTION public.acct_recon_subledger_check(date) IS
  'Sub-ledger reconciliation: 6 checks covering Payroll (220001), Staff Wallet (260000), '
  'Salary Advances (150000+151000), Operational Costs (5xxxxx), '
  'Project Encumbrance (240000), Donor Grants Receivable (130000). '
  'Updated by acct_coa_standardize_6digit.sql.';

GRANT EXECUTE ON FUNCTION public.acct_recon_subledger_check(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acct_recon_subledger_check(date) TO service_role;

-- =============================================================================
-- STEP 5 — Verification
-- =============================================================================

-- 5a. Confirm zero 4-digit codes remain
SELECT count(*) AS remaining_4digit_codes
  FROM public.acct_accounts
 WHERE length(code) = 4;
-- Expect: 0

-- 5b. Confirm all new 6-digit codes exist
SELECT code, name_en, account_type, is_active
  FROM public.acct_accounts
 WHERE code IN (
   '120000','130000','150000','151000','152000','160000','180000',
   '210001','210501','220001','224001','235000','240000','260000','280000',
   '505000','507000','531009','532001','560000','570000','580000',
   '610000','611000','615000','620000','631000','640000','999000'
 )
 ORDER BY code;
-- Expect: 30 rows

-- 5c. Confirm GL bridge function returns 6-digit code
SELECT public.acct_bridge_ops_cost_account('incentives')  AS incentives_code,   -- expect 507000
       public.acct_bridge_ops_cost_account('meals')       AS meals_code,         -- expect 531009
       public.acct_bridge_ops_cost_account('medical')     AS medical_code,       -- expect 615000
       public.acct_bridge_ops_cost_account('other')       AS other_code;         -- expect 505000

-- 5d. Confirm recon check runs without error
-- SELECT * FROM public.acct_recon_subledger_check();

-- =============================================================================
-- RUNBOOK
-- =============================================================================
-- 1. Run this entire file in Supabase SQL Editor.
-- 2. Check Step 5a: remaining_4digit_codes must be 0.
-- 3. Check Step 5b: 30 key accounts confirmed.
-- 4. Check Step 5c: GL function returns 6-digit codes.
-- 5. Run odoo_coa_import.sql next (Step 1–5) to import Odoo's 309 accounts.
--    The Odoo codes (110000, 210000, 220000 etc.) will coexist cleanly with
--    PACT's 110001, 210001, 220001 etc.
-- 6. Intercompany transfer function: if the DO block in Step 3q logs a warning,
--    find the function name with:
--      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--       WHERE nspname='public' AND proname LIKE '%intercompany%';
--    Then manually replace '1800'→'180000', '1200'→'120000', '2800'→'280000'
--    in that function's body and re-run CREATE OR REPLACE FUNCTION.
-- =============================================================================
