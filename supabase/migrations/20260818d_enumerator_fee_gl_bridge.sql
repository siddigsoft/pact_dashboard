-- =============================================================================
-- GL Bridge: Enumerator Fee Payments
-- Date: 2026-08-18
--
-- 1. Trigger function: acct_trig_mmp_site_entries_fee_paid
--    Fires on UPDATE of mmp_site_entries when fee_paid_status → 'paid'
--    GL entries:
--      DR  5200  Enumerator Fees Expense  (amount = enumerator_fee + transport_fee)
--      CR  1010  Cash on Hand             (or 1020 Bank if fee_payment_method = 'bank_transfer')
--      DR  1510  Travel Advances          (advance deduction, if any advance was disbursed)
--      CR  5200  Enumerator Fees Expense  (advance offset — reduces net expense)
--
-- 2. Trigger: trg_mmp_site_fee_gl_post on mmp_site_entries
--
-- 3. GL bridge config entry for 'enumerator_fee_paid'
--
-- 4. RPC: post_enumerator_fees_to_gl() — retroactive posting for existing paid rows
--
-- 5. GL bridge for cycle exception actions (Return, Writeoff, Redirect)
--    post_exception_recovery_to_gl() — called by Field Payments Centre on execution
--
-- Safe to re-run: DROP IF EXISTS / CREATE OR REPLACE / ON CONFLICT DO UPDATE
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GL config entries
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.acct_gl_bridge_config (source_event, event_label, event_description)
VALUES
  ('enumerator_fee_paid',
   'Enumerator Fee Payment',
   'Posted when Finance marks an enumerator site fee as paid. DR=5200 Enumerator Fees Expense, CR=1010 Cash or 1020 Bank. Net of any advance previously disbursed (advance offset: DR=1510, CR=5200).'),
  ('exception_return_received',
   'Exception — Cash Return Received',
   'Posted when Finance records a cash return from an enumerator (Return Required decision). DR=1010 Cash on Hand, CR=1510 Travel Advances.'),
  ('exception_writeoff',
   'Exception — Advance Written Off',
   'Posted when a transport advance is written off. DR=5900 Bad Debt Expense, CR=1510 Travel Advances.'),
  ('exception_redirect_to_fees',
   'Exception — Advance Redirected to Enumerator Fees',
   'Posted when advance is reclassified as enumerator fee payment. DR=5200 Enumerator Fees Expense, CR=1510 Travel Advances.')
ON CONFLICT (source_event) DO UPDATE
  SET event_label       = EXCLUDED.event_label,
      event_description = EXCLUDED.event_description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger function — fires when fee_paid_status flips to 'paid'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.acct_trig_mmp_site_entries_fee_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_fee    numeric(18,2);
  v_advance_amt  numeric(18,2) := 0;
  v_net_cash     numeric(18,2);
  v_cash_account text;
  v_entry_id     uuid;
  v_lines        jsonb;
  v_country_id   uuid;
BEGIN
  -- Only fire when fee_paid_status transitions to 'paid'
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF OLD.fee_paid_status = 'paid' THEN RETURN NEW; END IF;  -- already processed

  -- Already posted?
  IF EXISTS (
    SELECT 1 FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id    = NEW.id::text
      AND event_type   = 'enumerator_fee_paid'
      AND status       = 'success'
  ) THEN RETURN NEW; END IF;

  -- Compute fee total
  v_total_fee := COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0);
  IF v_total_fee <= 0 THEN RETURN NEW; END IF;

  -- Look up any disbursed advance for this site entry (for net-of-advance offset lines)
  SELECT COALESCE(total_paid_amount, requested_amount, 0)
  INTO   v_advance_amt
  FROM   public.down_payment_requests
  WHERE  mmp_site_entry_id = NEW.id
    AND  status IN ('paid', 'fully_paid', 'partially_paid')
  ORDER BY total_paid_amount DESC NULLS LAST
  LIMIT 1;

  v_advance_amt := COALESCE(v_advance_amt, 0);
  v_net_cash    := GREATEST(v_total_fee - v_advance_amt, 0);

  -- Cash account: bank_transfer → 1020, else → 1010 Cash on Hand
  v_cash_account := CASE
    WHEN NEW.fee_payment_method = 'bank_transfer' THEN '1020'
    ELSE '1010'
  END;

  -- Get country for partitioning
  SELECT m.country_id INTO v_country_id
  FROM   public.mmp_files m
  WHERE  m.id = NEW.mmp_file_id
  LIMIT  1;

  -- Build journal lines
  -- Line 1: DR Enumerator Fees Expense (full fee)
  -- Line 2: CR Cash / Bank (net cash paid out, i.e. fee minus advance already given)
  -- Lines 3+4 only when an advance was previously disbursed (offset entry)
  IF v_advance_amt > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_total_fee,  'currency','SDG','description','Enumerator Fee — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code',v_cash_account,'debit_credit','CR','amount',v_net_cash,   'currency','SDG','description','Cash paid (net of advance) — ' || COALESCE(NEW.site_name,'Site'),'function','none'),
      jsonb_build_object('account_code','1510','debit_credit','DR','amount',v_advance_amt,'currency','SDG','description','Advance offset — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code','5200','debit_credit','CR','amount',v_advance_amt,'currency','SDG','description','Advance offsets fee expense — ' || COALESCE(NEW.site_name,'Site'),'function','program')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_total_fee,'currency','SDG','description','Enumerator Fee — ' || COALESCE(NEW.site_name,'Site'),'function','program'),
      jsonb_build_object('account_code',v_cash_account,'debit_credit','CR','amount',v_total_fee,'currency','SDG','description','Cash payment — ' || COALESCE(NEW.site_name,'Site'),'function','none')
    );
  END IF;

  BEGIN
    v_entry_id := public.acct_bridge_post_journal(
      'mmp_site_entries', NEW.id, 'enumerator_fee_paid',
      COALESCE(NEW.fee_paid_at::date, current_date),
      'Enumerator Fee Paid: ' || COALESCE(NEW.site_name, NEW.id::text),
      'أجر معدد مدفوع: '      || COALESCE(NEW.site_name, NEW.id::text),
      v_lines,
      NEW.fee_paid_by,
      v_country_id
    );

    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES
      ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'success', v_entry_id);

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES
      ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'error', SQLERRM);
  END;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Attach trigger
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mmp_site_fee_gl_post ON public.mmp_site_entries;
CREATE TRIGGER trg_mmp_site_fee_gl_post
  AFTER UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.acct_trig_mmp_site_entries_fee_paid();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC — post_enumerator_fees_to_gl() (retroactive)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_enumerator_fees_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted  int := 0;
  v_skipped int := 0;
  v_errors  int := 0;
  v_rec     RECORD;
  v_advance numeric(18,2);
  v_net     numeric(18,2);
  v_fee     numeric(18,2);
  v_acc     text;
  v_lines   jsonb;
  v_eid     uuid;
  v_cid     uuid;
BEGIN
  FOR v_rec IN
    SELECT s.*, m.country_id
    FROM   public.mmp_site_entries s
    JOIN   public.mmp_files m ON m.id = s.mmp_file_id
    WHERE  s.fee_paid_status = 'paid'
      AND  NOT EXISTS (
             SELECT 1 FROM public.acct_gl_bridge_log l
             WHERE l.source_table = 'mmp_site_entries'
               AND l.source_id   = s.id::text
               AND l.event_type  = 'enumerator_fee_paid'
               AND l.status      = 'success'
           )
    ORDER BY s.fee_paid_at NULLS LAST
  LOOP
    BEGIN
      v_fee := COALESCE(v_rec.enumerator_fee, 0) + COALESCE(v_rec.transport_fee, 0);
      IF v_fee <= 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

      SELECT COALESCE(total_paid_amount, requested_amount, 0)
      INTO   v_advance
      FROM   public.down_payment_requests
      WHERE  mmp_site_entry_id = v_rec.id
        AND  status IN ('paid','fully_paid','partially_paid')
      ORDER BY total_paid_amount DESC NULLS LAST LIMIT 1;

      v_advance := COALESCE(v_advance, 0);
      v_net     := GREATEST(v_fee - v_advance, 0);
      v_acc     := CASE WHEN v_rec.fee_payment_method = 'bank_transfer' THEN '1020' ELSE '1010' END;
      v_cid     := v_rec.country_id;

      IF v_advance > 0 THEN
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,     'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc, 'debit_credit','CR','amount',v_net,     'currency','SDG','description','Cash paid (net) — '||COALESCE(v_rec.site_name,'Site'),'function','none'),
          jsonb_build_object('account_code','1510','debit_credit','DR','amount',v_advance,  'currency','SDG','description','Advance offset — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code','5200','debit_credit','CR','amount',v_advance,  'currency','SDG','description','Advance offsets fee — '||COALESCE(v_rec.site_name,'Site'),'function','program')
        );
      ELSE
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc, 'debit_credit','CR','amount',v_fee,'currency','SDG','description','Cash payment — '||COALESCE(v_rec.site_name,'Site'),'function','none')
        );
      END IF;

      v_eid := public.acct_bridge_post_journal(
        'mmp_site_entries', v_rec.id, 'enumerator_fee_paid',
        COALESCE(v_rec.fee_paid_at::date, current_date),
        'Enumerator Fee Paid: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        'أجر معدد مدفوع: '       || COALESCE(v_rec.site_name, v_rec.id::text),
        v_lines, v_rec.fee_paid_by, v_cid
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'success', v_eid);

      v_posted := v_posted + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'error', SQLERRM);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_enumerator_fees_to_gl() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC — post_exception_recovery_to_gl(p_action_id uuid)
--    Called by Field Payments Centre when Finance executes a Return/Writeoff/Redirect
--    Returns the journal entry id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_exception_recovery_to_gl(
  p_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  RECORD;
  v_amount  numeric(18,2);
  v_event   text;
  v_lines   jsonb;
  v_desc_en text;
  v_desc_ar text;
  v_eid     uuid;
  v_cid     uuid;
BEGIN
  -- Load exception action
  SELECT cea.*, m.country_id AS country_id
  INTO   v_action
  FROM   public.cycle_exception_actions cea
  JOIN   public.mmp_files m ON m.id = cea.mmp_file_id
  WHERE  cea.id = p_action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: cycle_exception_action % not found.', p_action_id;
  END IF;

  -- Already posted?
  IF v_action.gl_posted THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Already posted');
  END IF;

  v_amount := COALESCE(v_action.recovery_amount, v_action.advance_amount, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'Amount is zero');
  END IF;

  v_cid := v_action.country_id;

  -- Build entries per decision type
  CASE v_action.decision

    WHEN 'return' THEN
      -- Cash returned: DR Cash / CR Travel Advances
      v_event   := 'exception_return_received';
      v_desc_en := 'Cash Return — ' || COALESCE(v_action.site_name, 'Site');
      v_desc_ar := 'استرداد نقدي — '  || COALESCE(v_action.site_name, 'Site');
      v_lines   := jsonb_build_array(
        jsonb_build_object('account_code','1010','debit_credit','DR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','none'),
        jsonb_build_object('account_code','1510','debit_credit','CR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','program')
      );

    WHEN 'writeoff' THEN
      -- Write-off: DR Bad Debt Expense / CR Travel Advances
      v_event   := 'exception_writeoff';
      v_desc_en := 'Advance Write-Off — ' || COALESCE(v_action.site_name, 'Site');
      v_desc_ar := 'شطب سلفة — '           || COALESCE(v_action.site_name, 'Site');
      v_lines   := jsonb_build_array(
        jsonb_build_object('account_code','5900','debit_credit','DR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','program'),
        jsonb_build_object('account_code','1510','debit_credit','CR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','program')
      );

    WHEN 'redirect' THEN
      -- Redirect to fees: DR Enumerator Fees / CR Travel Advances
      v_event   := 'exception_redirect_to_fees';
      v_desc_en := 'Advance → Enumerator Fee — ' || COALESCE(v_action.site_name, 'Site');
      v_desc_ar := 'تحويل سلفة → أتعاب — '        || COALESCE(v_action.site_name, 'Site');
      v_lines   := jsonb_build_array(
        jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','program'),
        jsonb_build_object('account_code','1510','debit_credit','CR','amount',v_amount,'currency','SDG','description',v_desc_en,'function','program')
      );

    ELSE
      RETURN jsonb_build_object('skipped', true, 'reason', 'Decision type ' || v_action.decision || ' does not require a GL entry');
  END CASE;

  v_eid := public.acct_bridge_post_journal(
    'cycle_exception_actions', p_action_id, v_event,
    COALESCE(v_action.executed_at::date, current_date),
    v_desc_en, v_desc_ar,
    v_lines,
    v_action.executed_by,
    v_cid
  );

  -- Mark GL posted
  UPDATE public.cycle_exception_actions SET
    gl_posted          = true,
    gl_posted_at       = now(),
    gl_journal_entry_id = v_eid
  WHERE id = p_action_id;

  INSERT INTO public.acct_gl_bridge_log
    (source_table, source_id, event_type, status, journal_entry_id)
  VALUES
    ('cycle_exception_actions', p_action_id, v_event, 'success', v_eid);

  RETURN jsonb_build_object('journal_entry_id', v_eid, 'event', v_event, 'amount', v_amount);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.acct_gl_bridge_log
    (source_table, source_id, event_type, status, error_message)
  VALUES
    ('cycle_exception_actions', p_action_id, v_event, 'error', SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_exception_recovery_to_gl(uuid) TO authenticated;

COMMIT;
