-- =============================================================================
-- GL Bridge: Advances (Down-payments) + Operational Cost Submissions
-- Date: 2026-08-17
--
-- 1. Attaches the existing trigger functions to their source tables
--    (the functions were created in 20260511_acct_country_coa_partitioning.sql
--     but the CREATE TRIGGER statements were never run)
-- 2. Creates manual RPCs post_downpayments_to_gl() and post_cost_submissions_to_gl()
--    for retroactive posting of already-paid records
-- 3. Adds config rows to acct_gl_bridge_config for the two new event types
-- Safe to re-run: DROP IF EXISTS + CREATE OR REPLACE throughout
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. ENSURE acct_gl_bridge_config EXISTS
--    (idempotent — safe if 20260803c_acct_gl_bridge_config.sql was already run)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acct_gl_bridge_config (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event      text        NOT NULL UNIQUE,
  event_label       text        NOT NULL,
  event_description text,
  debit_account_id  uuid        REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  credit_account_id uuid        REFERENCES public.acct_accounts(id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acct_gl_bridge_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Finance roles can manage GL bridge config"
    ON public.acct_gl_bridge_config
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin','Admin','admin','finance','financialAdmin','accountant')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ATTACH TRIGGERS
--    The functions acct_trig_down_payment_requests and
--    acct_trig_operational_cost_submissions were created but never attached.
-- ─────────────────────────────────────────────────────────────────────────────

-- Down-payment GL trigger (fires when status → fully_paid)
DROP TRIGGER IF EXISTS trg_dpr_gl_post ON public.down_payment_requests;
CREATE TRIGGER trg_dpr_gl_post
  AFTER UPDATE ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.acct_trig_down_payment_requests();

-- Operational cost GL trigger (fires when status → paid)
DROP TRIGGER IF EXISTS trg_ocs_gl_post ON public.operational_cost_submissions;
CREATE TRIGGER trg_ocs_gl_post
  AFTER UPDATE ON public.operational_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.acct_trig_operational_cost_submissions();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GL BRIDGE CONFIG — add entries for the two new events
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.acct_gl_bridge_config (source_event, event_label, event_description)
VALUES
  ('down_payment_disbursement', 'Field Advance Disbursement',
   'Posted when a field advance (down-payment) is fully paid. DR = Staff / Travel Advances (1510), CR = Cash / Bank (1200).'),
  ('ops_cost_paid', 'Operational Cost Payment',
   'Posted when an operational cost submission is marked paid. DR = category-mapped expense account, CR = Cash / Bank (1200).')
ON CONFLICT (source_event) DO UPDATE
  SET event_label       = EXCLUDED.event_label,
      event_description = EXCLUDED.event_description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC — post_downpayments_to_gl()
--    Retroactively posts all fully-paid down-payment requests that have no
--    success log entry yet. Mirrors post_prefunding_to_gl() pattern.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_downpayments_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted   int  := 0;
  v_skipped  int  := 0;
  v_errors   int  := 0;
  v_rec      RECORD;
  v_entry_id uuid;
  v_amount   numeric(20,4);
  v_err_msg  text;
BEGIN
  FOR v_rec IN
    SELECT dpr.*
    FROM   public.down_payment_requests dpr
    WHERE  dpr.status = 'fully_paid'
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.acct_gl_bridge_log l
             WHERE  l.source_table = 'down_payment_requests'
               AND  l.source_id   = dpr.id::text
               AND  l.status      = 'success'
           )
    ORDER BY dpr.updated_at
  LOOP
    BEGIN
      v_amount := COALESCE(v_rec.total_paid_amount, v_rec.requested_amount, 0);

      IF v_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_entry_id := public.acct_bridge_post_journal(
        'down_payment_requests',
        v_rec.id,
        'fully_paid',
        COALESCE(v_rec.updated_at::date, current_date),
        'Field Advance Disbursed: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        'صرف سلفة ميدانية: '         || COALESCE(v_rec.site_name, v_rec.id::text),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1510',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Travel Advance — ' || COALESCE(v_rec.site_name, 'Field Site'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Cash — Field Advance #' || v_rec.id::text,
            'function',     'none'
          )
        ),
        v_rec.admin_processed_by,
        v_rec.country_id
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'success', v_entry_id);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('down_payment_requests', v_rec.id, 'down_payment_fully_paid', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_downpayments_to_gl() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC — post_cost_submissions_to_gl()
--    Retroactively posts all paid operational cost submissions with no
--    success log entry.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_cost_submissions_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted      int  := 0;
  v_skipped     int  := 0;
  v_errors      int  := 0;
  v_rec         RECORD;
  v_entry_id    uuid;
  v_amount      numeric(20,4);
  v_expense_acc text;
  v_err_msg     text;
BEGIN
  FOR v_rec IN
    SELECT ocs.*
    FROM   public.operational_cost_submissions ocs
    WHERE  ocs.status = 'paid'
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.acct_gl_bridge_log l
             WHERE  l.source_table = 'operational_cost_submissions'
               AND  l.source_id   = ocs.id::text
               AND  l.status      = 'success'
           )
    ORDER BY ocs.paid_at, ocs.updated_at
  LOOP
    BEGIN
      v_amount      := COALESCE(v_rec.paid_amount_cents, v_rec.amount_cents, 0) / 100.0;
      v_expense_acc := public.acct_bridge_ops_cost_account(v_rec.expense_category);

      IF v_amount <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_entry_id := public.acct_bridge_post_journal(
        'operational_cost_submissions',
        v_rec.id,
        'paid',
        COALESCE(v_rec.expense_date, v_rec.paid_at::date, current_date),
        'Operational Cost Paid: ' || COALESCE(v_rec.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: '   || COALESCE(v_rec.expense_category, 'عامة'),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_expense_acc,
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     COALESCE(v_rec.currency, 'SDG'),
            'description',  COALESCE(v_rec.description, v_rec.expense_category),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     COALESCE(v_rec.currency, 'SDG'),
            'description',  'Cash Payment — Ops Cost #' || v_rec.id::text,
            'function',     'none'
          )
        ),
        v_rec.tier2_approved_by,
        v_rec.country_id
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'success', v_entry_id);

      v_posted := v_posted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('operational_cost_submissions', v_rec.id, 'ops_cost_paid', 'error', v_err_msg);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_cost_submissions_to_gl() TO authenticated;

COMMIT;
