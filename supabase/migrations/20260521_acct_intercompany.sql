-- =============================================================================
-- PACT Accounting — Intercompany Fund Transfers
-- =============================================================================
-- What this does
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adds two global COA accounts for intercompany balances
--      1800  Due From Other PACT Entities  (asset — appears in FROM-country books)
--      2800  Due To Other PACT Entities    (liability — appears in TO-country books)
-- 2. Creates acct_intercompany_transfers table (the source-of-truth for transfers)
-- 3. Creates acct_bridge_post_intercompany() — posts TWO balanced journal entries
--      FROM-country GL: DR 1800 / CR 1200  (cash leaves, receivable created)
--      TO-country   GL: DR 1200 / CR 2800  (cash arrives, payable created)
-- 4. Creates trigger acct_trig_intercompany_approved — fires on status → 'approved'
-- 5. Feature flag:  acct.bridge.intercompany_transfers  (default ON)
-- 6. RLS policies for the new table
--
-- Intercompany accounting example
-- ─────────────────────────────────────────────────────────────────────────────
-- Uganda HQ sends UGX 10,000,000 (≈ USD 2,700) to Sudan for field operations:
--
--   Uganda GL  (country_id = <Uganda>)
--     DR  1800  Due From Sudan     10,000,000 UGX    [receivable: Uganda funded Sudan]
--     CR  1200  Cash at Bank       10,000,000 UGX    [Uganda cash decreases]
--
--   Sudan GL   (country_id = <Sudan>)
--     DR  1200  Cash at Bank       10,000,000 UGX    [Sudan cash increases]
--     CR  2800  Due To Uganda      10,000,000 UGX    [payable: Sudan owes Uganda]
--
-- On consolidation the 1800 (asset) and 2800 (liability) eliminate each other.
-- =============================================================================
-- Apply  : MANUAL — paste into Supabase SQL editor, run once
-- Depends: 20260511_acct_country_coa_partitioning.sql   (country_id on acct_accounts)
--          20260520_acct_phase2_gl_bridges.sql           (acct_bridge_post_journal 9-param)
-- Safe   : YES — all blocks are idempotent
-- =============================================================================

set lock_timeout = '5s';

-- =============================================================================
-- STEP 1 — Global COA accounts for intercompany balances
--           country_id IS NULL → they serve every country's ledger.
--           They appear in each country's trial balance filtered by
--           acct_journal_entries.country_id, not by acct_accounts.country_id.
-- =============================================================================
INSERT INTO public.acct_accounts
  (code, name_en, name_ar, account_type, subtype, parent_id, is_postable, country_id)
VALUES
  (
    '1800',
    'Due From Other PACT Entities',
    'مستحق من كيانات باكت الأخرى',
    'asset',
    'current_asset',
    (SELECT id FROM public.acct_accounts WHERE code = '1000' AND country_id IS NULL LIMIT 1),
    true,
    NULL   -- global: used by ALL countries
  ),
  (
    '2800',
    'Due To Other PACT Entities',
    'مستحق لكيانات باكت الأخرى',
    'liability',
    'current_liability',
    (SELECT id FROM public.acct_accounts WHERE code = '2000' AND country_id IS NULL LIMIT 1),
    true,
    NULL   -- global: used by ALL countries
  )
ON CONFLICT (code) WHERE country_id IS NULL DO NOTHING;
-- ↑ Must target the partial index explicitly (acct_accounts_code_global_uq).
--   The old UNIQUE(code) was dropped in 20260511; only partial indexes remain.

-- =============================================================================
-- STEP 2 — Feature flag
-- =============================================================================
INSERT INTO public.feature_flags (key, description, is_enabled)
VALUES (
  'acct.bridge.intercompany_transfers',
  'Auto-post GL journal entries when an intercompany transfer is approved',
  true
)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- STEP 3 — acct_intercompany_transfers table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.acct_intercompany_transfers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number  text        NOT NULL UNIQUE,            -- e.g. ICT-2026-0001
  from_country_id  uuid        NOT NULL REFERENCES countries(id),
  to_country_id    uuid        NOT NULL REFERENCES countries(id),
  amount           numeric(20,4) NOT NULL CHECK (amount > 0),
  currency         text        NOT NULL DEFAULT 'USD',
  transfer_date    date        NOT NULL DEFAULT current_date,
  description_en   text,
  description_ar   text,
  reference        text,       -- bank wire ref, SWIFT code, etc.
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','posted','cancelled')),
  requested_by     uuid        REFERENCES public.profiles(id),
  approved_by      uuid        REFERENCES public.profiles(id),
  approved_at      timestamptz,
  from_je_id       uuid        REFERENCES public.acct_journal_entries(id),  -- FROM-country JE
  to_je_id         uuid        REFERENCES public.acct_journal_entries(id),  -- TO-country JE
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ict_different_countries CHECK (from_country_id <> to_country_id)
);

CREATE INDEX IF NOT EXISTS idx_ict_from_country ON public.acct_intercompany_transfers(from_country_id);
CREATE INDEX IF NOT EXISTS idx_ict_to_country   ON public.acct_intercompany_transfers(to_country_id);
CREATE INDEX IF NOT EXISTS idx_ict_status        ON public.acct_intercompany_transfers(status);
CREATE INDEX IF NOT EXISTS idx_ict_transfer_date ON public.acct_intercompany_transfers(transfer_date DESC);

-- updated_at auto-stamp
CREATE OR REPLACE FUNCTION public.ict_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_ict_updated_at ON public.acct_intercompany_transfers;
CREATE TRIGGER trg_ict_updated_at
  BEFORE UPDATE ON public.acct_intercompany_transfers
  FOR EACH ROW EXECUTE FUNCTION public.ict_set_updated_at();

-- =============================================================================
-- STEP 4 — RLS on acct_intercompany_transfers
-- =============================================================================
ALTER TABLE public.acct_intercompany_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ict_select ON public.acct_intercompany_transfers;
CREATE POLICY ict_select ON public.acct_intercompany_transfers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND lower(role) IN ('super_admin','superadmin','admin','finance',
                             'accountant','auditor','country_director','countrydirector')
    )
  );

DROP POLICY IF EXISTS ict_insert ON public.acct_intercompany_transfers;
CREATE POLICY ict_insert ON public.acct_intercompany_transfers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND lower(role) IN ('super_admin','superadmin','admin','finance','accountant')
    )
  );

DROP POLICY IF EXISTS ict_update ON public.acct_intercompany_transfers;
CREATE POLICY ict_update ON public.acct_intercompany_transfers
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND lower(role) IN ('super_admin','superadmin','admin','finance','accountant')
    )
  );

-- =============================================================================
-- STEP 5 — Bridge posting function
--
-- Posts TWO balanced journal entries — one in the FROM-country's ledger,
-- one in the TO-country's ledger — then stamps both JE ids back on the
-- transfer row.
--
-- FROM-country entry  (cash leaves Uganda):
--   DR  1800  Due From Other PACT Entities  p_amount
--   CR  1200  Cash at Bank                 p_amount
--
-- TO-country entry  (cash arrives in Sudan):
--   DR  1200  Cash at Bank                 p_amount
--   CR  2800  Due To Other PACT Entities   p_amount
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_bridge_post_intercompany(
  p_transfer_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xfer          public.acct_intercompany_transfers%ROWTYPE;
  v_from_country  text;
  v_to_country    text;
  v_desc_en_from  text;
  v_desc_ar_from  text;
  v_desc_en_to    text;
  v_desc_ar_to    text;
  v_from_je_id    uuid;
  v_to_je_id      uuid;
  v_engine_on     boolean;
  v_bridge_on     boolean;
BEGIN
  -- Gate checks
  SELECT is_enabled INTO v_engine_on
    FROM public.feature_flags WHERE key = 'acct.posting_engine.enabled';
  IF NOT COALESCE(v_engine_on, false) THEN
    RAISE EXCEPTION 'ICT_SKIP: acct.posting_engine.enabled is OFF';
  END IF;

  SELECT is_enabled INTO v_bridge_on
    FROM public.feature_flags WHERE key = 'acct.bridge.intercompany_transfers';
  IF NOT COALESCE(v_bridge_on, false) THEN
    RAISE EXCEPTION 'ICT_SKIP: acct.bridge.intercompany_transfers is OFF';
  END IF;

  -- Load transfer record
  SELECT * INTO v_xfer
    FROM public.acct_intercompany_transfers
   WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ICT_NOT_FOUND: transfer % does not exist', p_transfer_id;
  END IF;
  IF v_xfer.amount <= 0 THEN
    RAISE EXCEPTION 'ICT_ZERO_AMOUNT: transfer amount must be > 0';
  END IF;

  -- Resolve country names for descriptions
  SELECT name_en INTO v_from_country FROM public.countries WHERE id = v_xfer.from_country_id;
  SELECT name_en INTO v_to_country   FROM public.countries WHERE id = v_xfer.to_country_id;

  v_desc_en_from := format('Intercompany Transfer to %s — %s',
                           COALESCE(v_to_country, 'Unknown'),
                           COALESCE(v_xfer.transfer_number, p_transfer_id::text));
  v_desc_ar_from := format('تحويل داخلي إلى %s — %s',
                           COALESCE(v_to_country, 'غير معروف'),
                           COALESCE(v_xfer.transfer_number, p_transfer_id::text));

  v_desc_en_to   := format('Intercompany Transfer from %s — %s',
                           COALESCE(v_from_country, 'Unknown'),
                           COALESCE(v_xfer.transfer_number, p_transfer_id::text));
  v_desc_ar_to   := format('تحويل داخلي من %s — %s',
                           COALESCE(v_from_country, 'غير معروف'),
                           COALESCE(v_xfer.transfer_number, p_transfer_id::text));

  -- ── FROM-country journal entry ──────────────────────────────────────────────
  -- DR 1800 Due From Other PACT Entities  (receivable: we funded another entity)
  -- CR 1200 Cash at Bank                  (our cash goes out)
  v_from_je_id := public.acct_bridge_post_journal(
    'intercompany_transfers',
    p_transfer_id,
    'approved_from',
    v_xfer.transfer_date,
    v_desc_en_from,
    v_desc_ar_from,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '1800',
        'debit_credit', 'DR',
        'amount',       v_xfer.amount,
        'currency',     v_xfer.currency,
        'description',  format('Funding sent to %s — ref: %s',
                               COALESCE(v_to_country, 'Unknown'),
                               COALESCE(v_xfer.reference, v_xfer.transfer_number)),
        'function',     'none'
      ),
      jsonb_build_object(
        'account_code', '1200',
        'debit_credit', 'CR',
        'amount',       v_xfer.amount,
        'currency',     v_xfer.currency,
        'description',  format('Cash transfer out — ICT %s', v_xfer.transfer_number),
        'function',     'none'
      )
    ),
    v_xfer.approved_by,
    v_xfer.from_country_id   -- ← stamped to FROM-country ledger
  );

  -- ── TO-country journal entry ────────────────────────────────────────────────
  -- DR 1200 Cash at Bank                  (receiving-country cash goes up)
  -- CR 2800 Due To Other PACT Entities    (payable: we owe the sending entity)
  v_to_je_id := public.acct_bridge_post_journal(
    'intercompany_transfers',
    p_transfer_id,
    'approved_to',
    v_xfer.transfer_date,
    v_desc_en_to,
    v_desc_ar_to,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '1200',
        'debit_credit', 'DR',
        'amount',       v_xfer.amount,
        'currency',     v_xfer.currency,
        'description',  format('Cash transfer in from %s — ICT %s',
                               COALESCE(v_from_country, 'Unknown'),
                               v_xfer.transfer_number),
        'function',     'none'
      ),
      jsonb_build_object(
        'account_code', '2800',
        'debit_credit', 'CR',
        'amount',       v_xfer.amount,
        'currency',     v_xfer.currency,
        'description',  format('Funding received from %s — ref: %s',
                               COALESCE(v_from_country, 'Unknown'),
                               COALESCE(v_xfer.reference, v_xfer.transfer_number)),
        'function',     'none'
      )
    ),
    v_xfer.approved_by,
    v_xfer.to_country_id     -- ← stamped to TO-country ledger
  );

  -- ── Stamp JE ids back on the transfer + mark posted ────────────────────────
  UPDATE public.acct_intercompany_transfers
     SET from_je_id = v_from_je_id,
         to_je_id   = v_to_je_id,
         status     = 'posted',
         updated_at = now()
   WHERE id = p_transfer_id;

END $$;

COMMENT ON FUNCTION public.acct_bridge_post_intercompany(uuid) IS
  'Posts two balanced GL journal entries (one per country) for an intercompany '
  'fund transfer. FROM-country: DR 1800 / CR 1200. TO-country: DR 1200 / CR 2800.';

-- =============================================================================
-- STEP 6 — Trigger: auto-post when status flips to ''approved''
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_trig_intercompany_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op = 'UPDATE'
     AND old.status IS DISTINCT FROM new.status
     AND new.status = 'approved' THEN

    BEGIN
      PERFORM public.acct_bridge_post_intercompany(new.id);

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status)
      VALUES
        ('intercompany_transfers', new.id, 'intercompany_approved', 'success');

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('intercompany_transfers', new.id, 'intercompany_approved', 'error', sqlerrm);
    END;
  END IF;

  RETURN new;
END $$;

DROP TRIGGER IF EXISTS acct_bridge_intercompany ON public.acct_intercompany_transfers;
CREATE TRIGGER acct_bridge_intercompany
  AFTER UPDATE ON public.acct_intercompany_transfers
  FOR EACH ROW EXECUTE FUNCTION public.acct_trig_intercompany_approved();

-- =============================================================================
-- STEP 7 — Helper: generate sequential transfer_number
-- =============================================================================
CREATE OR REPLACE FUNCTION public.acct_next_transfer_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year  int  := date_part('year', now())::int;
  v_seq   int;
BEGIN
  SELECT COUNT(*) + 1
    INTO v_seq
    FROM public.acct_intercompany_transfers
   WHERE date_part('year', created_at) = v_year;

  RETURN format('ICT-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END $$;

-- =============================================================================
-- STEP 8 — Verify: summary of what was created
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM public.acct_accounts     WHERE code IN ('1800','2800')) AS intercompany_accounts_added,
  (SELECT is_enabled FROM public.feature_flags   WHERE key = 'acct.bridge.intercompany_transfers') AS bridge_flag_enabled,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'acct_intercompany_transfers') AS table_exists,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name = 'acct_bridge_intercompany') AS trigger_exists;
