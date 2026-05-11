-- =============================================================================
-- PACT Accounting — Country-stamp payroll / HR / wallet GL bridges
-- =============================================================================
-- What this does
-- ─────────────────────────────────────────────────────────────────────────────
-- The Phase 2 GL bridges for payroll_runs, withdrawal_requests,
-- salary_advances (hr_salary_advances), and wallet_transactions all used the
-- old 8-param acct_bridge_post_journal and posted journal entries with
-- country_id = NULL.  In a multi-country org this makes those entries appear
-- as "global" and invisible in per-country GL filtered views.
--
-- This migration:
--   1. Adds country_id (IF NOT EXISTS) to each source table
--   2. Creates auto-stamp triggers (BEFORE INSERT) to derive country from
--      the relevant user's profile (approved_by / created_by / employee_id)
--   3. Updates all four GL bridge trigger functions to look up country_id
--      and pass it as the 9th param to acct_bridge_post_journal
--   4. Backfills existing records (WHERE country_id IS NULL)
-- =============================================================================
-- Apply  : MANUAL — paste into Supabase SQL editor, run once
-- Safe   : YES — all changes use IF NOT EXISTS / CREATE OR REPLACE
-- Depends: 20260511_acct_country_coa_partitioning.sql (9-param bridge)
-- =============================================================================

set lock_timeout = '5s';

-- =============================================================================
-- STEP 1 — payroll_runs: add country_id + auto-stamp from approved_by / created_by
-- =============================================================================
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_country_id
  ON public.payroll_runs(country_id);

CREATE OR REPLACE FUNCTION public.payroll_runs_stamp_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country_id IS NULL THEN
    SELECT country_id INTO NEW.country_id
      FROM public.profiles
     WHERE id = COALESCE(NEW.approved_by, NEW.created_by)
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_runs_stamp_country ON public.payroll_runs;
CREATE TRIGGER trg_payroll_runs_stamp_country
  BEFORE INSERT ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_stamp_country();

-- =============================================================================
-- STEP 2 — withdrawal_requests: add country_id + auto-stamp from user_id / supervisor_id
-- =============================================================================
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_country_id
  ON public.withdrawal_requests(country_id);

CREATE OR REPLACE FUNCTION public.withdrawal_requests_stamp_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country_id IS NULL THEN
    SELECT country_id INTO NEW.country_id
      FROM public.profiles
     WHERE id = COALESCE(NEW.user_id, NEW.supervisor_id)
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_withdrawal_requests_stamp_country ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_requests_stamp_country
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.withdrawal_requests_stamp_country();

-- =============================================================================
-- STEP 3 — hr_salary_advances: add country_id + auto-stamp from employee_id / finance_id
-- =============================================================================
DO $$ BEGIN
  IF to_regclass('public.hr_salary_advances') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.hr_salary_advances
               ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_salary_advances_country_id
               ON public.hr_salary_advances(country_id)';
  ELSIF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.salary_advances
               ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_salary_advances_country_id
               ON public.salary_advances(country_id)';
  ELSE
    RAISE NOTICE 'SKIP: neither hr_salary_advances nor salary_advances found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.salary_advances_stamp_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country_id IS NULL THEN
    SELECT country_id INTO NEW.country_id
      FROM public.profiles
     WHERE id = NEW.user_id
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.hr_salary_advances') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_hr_salary_advances_stamp_country ON public.hr_salary_advances';
    EXECUTE 'CREATE TRIGGER trg_hr_salary_advances_stamp_country
               BEFORE INSERT ON public.hr_salary_advances
               FOR EACH ROW EXECUTE FUNCTION public.salary_advances_stamp_country()';
  ELSIF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_salary_advances_stamp_country ON public.salary_advances';
    EXECUTE 'CREATE TRIGGER trg_salary_advances_stamp_country
               BEFORE INSERT ON public.salary_advances
               FOR EACH ROW EXECUTE FUNCTION public.salary_advances_stamp_country()';
  END IF;
END $$;

-- =============================================================================
-- STEP 4 — wallet_transactions: add country_id + auto-stamp from created_by / user_id
-- =============================================================================
DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.wallet_transactions
               ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES countries(id) ON DELETE SET NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wallet_transactions_country_id
               ON public.wallet_transactions(country_id)';
  ELSE
    RAISE NOTICE 'SKIP: wallet_transactions table not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.wallet_transactions_stamp_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country_id IS NULL THEN
    SELECT country_id INTO NEW.country_id
      FROM public.profiles
     WHERE id = COALESCE(NEW.created_by, NEW.user_id)
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_wallet_transactions_stamp_country ON public.wallet_transactions';
    EXECUTE 'CREATE TRIGGER trg_wallet_transactions_stamp_country
               BEFORE INSERT ON public.wallet_transactions
               FOR EACH ROW EXECUTE FUNCTION public.wallet_transactions_stamp_country()';
  END IF;
END $$;

-- =============================================================================
-- STEP 5 — Update acct_trig_payroll_runs to pass country_id
--           Derives country: new.country_id → approved_by profile → created_by profile
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_payroll_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_gross   numeric(20,4);
  v_total_net     numeric(20,4);
  v_total_deducts numeric(20,4);
  v_entry_id      uuid;
  v_country_id    uuid;
BEGIN
  -- Resolve country: prefer column, fall back to approver's / creator's profile
  v_country_id := new.country_id;
  IF v_country_id IS NULL THEN
    SELECT country_id INTO v_country_id
      FROM public.profiles
     WHERE id = COALESCE(new.approved_by, new.created_by)
     LIMIT 1;
  END IF;

  -- ── APPROVED: recognise payroll expense ─────────────────────────────────────
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'approved' THEN

    SELECT
      coalesce(sum(gross_salary),     0),
      coalesce(sum(net_salary),       0),
      coalesce(sum(deductions_total), 0)
    INTO v_total_gross, v_total_net, v_total_deducts
    FROM public.payroll_run_items
    WHERE run_id = new.id;

    IF v_total_gross > 0 THEN
      BEGIN
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs', new.id, 'approved',
          coalesce(new.approved_at::date, current_date),
          'Payroll Expense Recognised: ' || new.period_label,
          'تسجيل مصروف الرواتب: '        || new.period_label,
          jsonb_build_array(
            jsonb_build_object('account_code','6100','debit_credit','DR','amount',v_total_gross,
              'currency','SDG','description','Gross Salaries — ' || new.period_label,'function','mng'),
            jsonb_build_object('account_code','2200','debit_credit','CR','amount',v_total_net,
              'currency','SDG','description','Net Payroll Payable — ' || new.period_label,'function','none'),
            jsonb_build_object('account_code','2110','debit_credit','CR','amount',v_total_deducts,
              'currency','SDG','description','Accrued Statutory Deductions — ' || new.period_label,'function','none')
          ),
          new.approved_by,
          v_country_id        -- ← country stamp
        );
        INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,journal_entry_id)
        VALUES ('payroll_runs',new.id,'payroll_approved','success',v_entry_id);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,error_message)
        VALUES ('payroll_runs',new.id,'payroll_approved','error',sqlerrm);
      END;
    END IF;
  END IF;

  -- ── LOCKED: clear payable with cash disbursement ─────────────────────────────
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'locked' THEN

    SELECT coalesce(sum(net_salary), 0) INTO v_total_net
    FROM public.payroll_run_items WHERE run_id = new.id;

    IF v_total_net > 0 THEN
      BEGIN
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs', new.id, 'locked',
          current_date,
          'Payroll Disbursement: ' || new.period_label,
          'صرف الرواتب: '          || new.period_label,
          jsonb_build_array(
            jsonb_build_object('account_code','2200','debit_credit','DR','amount',v_total_net,
              'currency','SDG','description','Clear Payroll Payable — ' || new.period_label,'function','none'),
            jsonb_build_object('account_code','1200','debit_credit','CR','amount',v_total_net,
              'currency','SDG','description','Cash at Bank — Payroll Payment — ' || new.period_label,'function','none')
          ),
          new.approved_by,
          v_country_id        -- ← country stamp
        );
        INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,journal_entry_id)
        VALUES ('payroll_runs',new.id,'payroll_locked','success',v_entry_id);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,error_message)
        VALUES ('payroll_runs',new.id,'payroll_locked','error',sqlerrm);
      END;
    END IF;
  END IF;

  RETURN new;
END $$;

-- =============================================================================
-- STEP 6 — Update acct_trig_withdrawal_requests to pass country_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_withdrawal_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id   uuid;
  v_amount     numeric(20,4);
  v_country_id uuid;
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'approved' THEN

    v_amount := coalesce(new.amount, 0);
    IF v_amount <= 0 THEN RETURN new; END IF;

    -- Resolve country
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id
        FROM public.profiles
       WHERE id = COALESCE(new.user_id, new.supervisor_id)
       LIMIT 1;
    END IF;

    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'withdrawal_requests', new.id, 'approved',
        coalesce(new.approved_at::date, current_date),
        'Wallet Withdrawal Approved',
        'سحب محفظة معتمد',
        jsonb_build_array(
          jsonb_build_object('account_code','2600','debit_credit','DR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Wallet Payable — Withdrawal #' || new.id::text,'function','none'),
          jsonb_build_object('account_code','1200','debit_credit','CR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash Disbursement — Wallet Withdrawal #' || new.id::text,'function','none')
        ),
        new.supervisor_id,
        v_country_id        -- ← country stamp
      );
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,journal_entry_id)
      VALUES ('withdrawal_requests',new.id,'withdrawal_approved','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,error_message)
      VALUES ('withdrawal_requests',new.id,'withdrawal_approved','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- =============================================================================
-- STEP 7 — Update acct_trig_salary_advances to pass country_id
--           Works for both salary_advances and hr_salary_advances table names.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_salary_advances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id   uuid;
  v_country_id uuid;
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'disbursed' THEN

    IF coalesce(new.amount, 0) <= 0 THEN RETURN new; END IF;

    -- Resolve country
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id
        FROM public.profiles
       WHERE id = new.user_id
       LIMIT 1;
    END IF;

    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'salary_advances', new.id, 'disbursed',
        coalesce(new.disbursed_at::date, current_date),
        'Salary Advance Disbursed',
        'صرف سلفة راتب',
        jsonb_build_array(
          jsonb_build_object('account_code','1500','debit_credit','DR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Advance — ' || new.id::text,'function','mng'),
          jsonb_build_object('account_code','1200','debit_credit','CR','amount',new.amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Cash — Salary Advance #' || new.id::text,'function','none')
        ),
        new.finance_id,
        v_country_id        -- ← country stamp
      );
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,journal_entry_id)
      VALUES ('salary_advances',new.id,'salary_advance_disbursed','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,error_message)
      VALUES ('salary_advances',new.id,'salary_advance_disbursed','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- =============================================================================
-- STEP 8 — Update acct_trig_wallet_reward to pass country_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_wallet_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id   uuid;
  v_amount     numeric(20,4);
  v_country_id uuid;
BEGIN
  IF tg_op = 'INSERT' AND new.type = 'reward' THEN

    v_amount := coalesce(new.amount, new.amount_cents / 100.0);
    IF coalesce(v_amount, 0) <= 0 THEN RETURN new; END IF;

    -- Resolve country
    v_country_id := new.country_id;
    IF v_country_id IS NULL THEN
      SELECT country_id INTO v_country_id
        FROM public.profiles
       WHERE id = COALESCE(new.created_by, new.user_id)
       LIMIT 1;
    END IF;

    BEGIN
      v_entry_id := public.acct_bridge_post_journal(
        'wallet_transactions', new.id, 'reward_credit',
        coalesce(new.created_at::date, current_date),
        'Task Reward Earned',
        'مكافأة مهمة مكتسبة',
        jsonb_build_array(
          jsonb_build_object('account_code','5310','debit_credit','DR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description',coalesce(new.memo, new.description, 'Task Reward'),'function','program'),
          jsonb_build_object('account_code','2600','debit_credit','CR','amount',v_amount,
            'currency',coalesce(new.currency,'SDG'),
            'description','Staff Wallet Payable — Reward','function','none')
        ),
        new.created_by,
        v_country_id        -- ← country stamp
      );
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,journal_entry_id)
      VALUES ('wallet_transactions',new.id,'reward_credit','success',v_entry_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log (source_table,source_id,event_type,status,error_message)
      VALUES ('wallet_transactions',new.id,'reward_credit','error',sqlerrm);
    END;
  END IF;
  RETURN new;
END $$;

-- =============================================================================
-- STEP 9 — Re-bind triggers (payroll_runs guarded; others safe)
-- =============================================================================

-- payroll_runs
DO $$ BEGIN
  IF to_regclass('public.payroll_runs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS acct_bridge_payroll_runs ON public.payroll_runs';
    EXECUTE 'CREATE TRIGGER acct_bridge_payroll_runs
               AFTER UPDATE ON public.payroll_runs
               FOR EACH ROW EXECUTE FUNCTION public.acct_trig_payroll_runs()';
  END IF;
END $$;

-- withdrawal_requests
DROP TRIGGER IF EXISTS acct_bridge_withdrawal_requests ON public.withdrawal_requests;
CREATE TRIGGER acct_bridge_withdrawal_requests
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.acct_trig_withdrawal_requests();

-- salary_advances (try both table names)
DO $$ BEGIN
  IF to_regclass('public.hr_salary_advances') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS acct_bridge_salary_advances ON public.hr_salary_advances';
    EXECUTE 'CREATE TRIGGER acct_bridge_salary_advances
               AFTER UPDATE ON public.hr_salary_advances
               FOR EACH ROW EXECUTE FUNCTION public.acct_trig_salary_advances()';
  ELSIF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS acct_bridge_salary_advances ON public.salary_advances';
    EXECUTE 'CREATE TRIGGER acct_bridge_salary_advances
               AFTER UPDATE ON public.salary_advances
               FOR EACH ROW EXECUTE FUNCTION public.acct_trig_salary_advances()';
  END IF;
END $$;

-- wallet_transactions
DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS acct_bridge_wallet_reward ON public.wallet_transactions';
    EXECUTE 'CREATE TRIGGER acct_bridge_wallet_reward
               AFTER INSERT ON public.wallet_transactions
               FOR EACH ROW EXECUTE FUNCTION public.acct_trig_wallet_reward()';
  END IF;
END $$;

-- =============================================================================
-- STEP 10 — Backfill country_id on existing records (safe, only updates NULLs)
-- =============================================================================

-- payroll_runs — via approved_by or created_by
UPDATE public.payroll_runs pr
   SET country_id = p.country_id
  FROM public.profiles p
 WHERE p.id = COALESCE(pr.approved_by, pr.created_by)
   AND pr.country_id IS NULL
   AND p.country_id IS NOT NULL;

-- withdrawal_requests — via user_id or supervisor_id
UPDATE public.withdrawal_requests wr
   SET country_id = p.country_id
  FROM public.profiles p
 WHERE p.id = COALESCE(wr.user_id, wr.supervisor_id)
   AND wr.country_id IS NULL
   AND p.country_id IS NOT NULL;

-- hr_salary_advances / salary_advances — via employee_id or finance_id
DO $$ BEGIN
  IF to_regclass('public.hr_salary_advances') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.hr_salary_advances sa
         SET country_id = p.country_id
        FROM public.profiles p
       WHERE p.id = sa.user_id
         AND sa.country_id IS NULL
         AND p.country_id IS NOT NULL
    $q$;
  ELSIF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.salary_advances sa
         SET country_id = p.country_id
        FROM public.profiles p
       WHERE p.id = COALESCE(sa.user_id, sa.employee_id)
         AND sa.country_id IS NULL
         AND p.country_id IS NOT NULL
    $q$;
  END IF;
END $$;

-- wallet_transactions — via created_by or user_id
DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.wallet_transactions wt
         SET country_id = p.country_id
        FROM public.profiles p
       WHERE p.id = COALESCE(wt.created_by, wt.user_id)
         AND wt.country_id IS NULL
         AND p.country_id IS NOT NULL
    $q$;
  END IF;
END $$;

-- =============================================================================
-- STEP 11 — Verify: show country coverage per table
-- =============================================================================
SELECT 'payroll_runs'          AS tbl, COUNT(*) AS total, COUNT(country_id) AS stamped FROM public.payroll_runs
UNION ALL
SELECT 'withdrawal_requests',  COUNT(*), COUNT(country_id) FROM public.withdrawal_requests
UNION ALL
SELECT 'acct_journal_entries', COUNT(*), COUNT(country_id) FROM public.acct_journal_entries;
