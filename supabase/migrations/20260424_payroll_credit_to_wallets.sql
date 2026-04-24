-- ============================================================================
-- Payroll → Wallet auto-credit
-- ============================================================================
-- Adds credit_payroll_run_to_wallets(p_run_id) which posts each
-- payroll_run_item.net_salary as a wallet_transactions row of type 'earning'
-- and bumps the recipient wallet's balance_cents / total_earned totals.
--
-- Concurrency safety:
--   A partial unique index on (metadata ->> 'payroll_run_item_id') guarantees
--   that even if two callers approve simultaneously, the database rejects the
--   duplicate insert. The function uses INSERT ... ON CONFLICT DO NOTHING and
--   only updates the wallet balance when a row was actually inserted.
--
-- Authorization:
--   Mirrors PayrollAdmin.tsx's `canApprove` gate exactly:
--     canApprove = isSuperAdmin || isFinance
--     isSuperAdmin = ['super_admin','superAdmin','SuperAdmin']
--     isFinance    = ['finance','Finance']
--   Comparison is case-insensitive via lower(), so all variants are covered.
--   HR / generic 'admin' / cfo / finance_manager are intentionally NOT
--   included — only the page's actual approvers may move money.
--
-- Notifications/payslip-ready emails remain handled by the client-side flow
-- in PayrollAdmin.tsx — this RPC only moves money and reports back the count.
-- ============================================================================

-- Partial unique index — guards against double-credit at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_payroll_run_item
  ON public.wallet_transactions ((metadata ->> 'payroll_run_item_id'))
  WHERE metadata ? 'payroll_run_item_id';

CREATE OR REPLACE FUNCTION public.credit_payroll_run_to_wallets(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          record;
  v_item         record;
  v_wallet_id    uuid;
  v_amount_cents bigint;
  v_currency     text;
  v_inserted_id  uuid;
  v_credited     int := 0;
  v_skipped      int := 0;
  v_caller_role  text;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────
  -- Mirrors PayrollAdmin.tsx canApprove (super_admin variants OR finance
  -- variants only). Case-insensitive via lower().
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL
     OR lower(v_caller_role) NOT IN ('super_admin','superadmin','finance')
  THEN
    RAISE EXCEPTION 'Unauthorized: only super_admin or finance may credit payroll (caller role: %)', COALESCE(v_caller_role, 'NULL')
      USING ERRCODE = '42501';
  END IF;

  -- ── Load the run ─────────────────────────────────────────────────────────
  SELECT id, status, period_label, currency
  INTO   v_run
  FROM   payroll_runs
  WHERE  id = p_run_id;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Payroll run % not found', p_run_id USING ERRCODE = 'P0002';
  END IF;

  IF v_run.status NOT IN ('approved','locked') THEN
    RAISE EXCEPTION 'Payroll run must be approved or locked before crediting (current: %)', v_run.status
      USING ERRCODE = '22023';
  END IF;

  -- ── Iterate items and post credits ──────────────────────────────────────
  FOR v_item IN
    SELECT id, user_id, net_salary, currency
    FROM   payroll_run_items
    WHERE  run_id = p_run_id
      AND  user_id IS NOT NULL
      AND  COALESCE(net_salary, 0) > 0
  LOOP
    v_amount_cents := ROUND(v_item.net_salary * 100)::bigint;
    v_currency     := COALESCE(v_item.currency, v_run.currency, 'SDG');

    -- Find / create wallet
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_item.user_id;
    IF v_wallet_id IS NULL THEN
      INSERT INTO wallets (user_id, currency)
      VALUES (v_item.user_id, v_currency)
      RETURNING id INTO v_wallet_id;
    END IF;

    -- Atomic, idempotent insert — the partial unique index on
    -- metadata.payroll_run_item_id guarantees no duplicate even under
    -- concurrent calls. RETURNING tells us whether we actually inserted.
    INSERT INTO wallet_transactions (
      wallet_id, user_id, amount_cents, amount, currency,
      type, status, posted_at, description, metadata, created_by
    )
    VALUES (
      v_wallet_id, v_item.user_id, v_amount_cents, v_item.net_salary, v_currency,
      'earning', 'posted', now(),
      'Payroll ' || COALESCE(v_run.period_label, ''),
      jsonb_build_object(
        'payroll_run_id',      p_run_id,
        'payroll_run_item_id', v_item.id,
        'period',              v_run.period_label,
        'source',              'payroll_auto_credit'
      ),
      auth.uid()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      -- Conflict hit the partial unique index → already credited
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Bump wallet totals — only when an insert actually happened
    UPDATE wallets
    SET    balance_cents      = balance_cents      + v_amount_cents,
           total_earned_cents = total_earned_cents + v_amount_cents,
           total_earned       = COALESCE(total_earned, 0) + v_item.net_salary,
           updated_at         = now()
    WHERE  id = v_wallet_id;

    v_credited := v_credited + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'run_id',   p_run_id,
    'credited', v_credited,
    'skipped',  v_skipped,
    'status',   'ok'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_payroll_run_to_wallets(uuid) TO authenticated;

COMMENT ON FUNCTION public.credit_payroll_run_to_wallets(uuid) IS
'Credits each payroll_run_item.net_salary to the recipient wallet (type=earning, status=posted). Idempotent and concurrency-safe via partial unique index on metadata.payroll_run_item_id. Restricted to super_admin or finance (mirrors PayrollAdmin.canApprove). Call from PayrollAdmin after payroll_runs.status is set to approved.';
