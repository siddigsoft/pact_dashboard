#!/usr/bin/env bash
set -euo pipefail

# Applies the production migration itself to a deliberately small, production-
# shaped schema.  The harness does not copy any function from the migration.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v psql)")"
PG_USER="$(id -un)"
PG_DIR="$(mktemp -d /tmp/wfp-fee-gating.XXXXXX)"
PORT="${PG_PORT:-55474}"
trap '"$PG_BIN/pg_ctl" -D "$PG_DIR" -m fast -w stop >/dev/null 2>&1 || true; rm -rf "$PG_DIR"' EXIT
"$PG_BIN/initdb" -D "$PG_DIR" --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PG_DIR" -o "-p $PORT -k /tmp" -w start >/dev/null
P=( "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -U "$PG_USER" -h /tmp -p "$PORT" -d postgres )

"${P[@]}" <<'SQL'
CREATE EXTENSION pgcrypto;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE TYPE wallet_tx_type AS ENUM
 ('site_visit_fee','withdrawal','adjustment','bonus','penalty','earning',
  'adjustment_credit','adjustment_debit');
CREATE TABLE profiles (id uuid PRIMARY KEY, role text);
CREATE TABLE mmp_files (id uuid PRIMARY KEY, country_id uuid);
CREATE TABLE mmp_site_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mmp_file_id uuid,
 accepted_by text, claimed_by uuid, visit_completed_by uuid, visit_started_by uuid, status text,
 enumerator_fee numeric, transport_fee numeric, cost numeric, site_name text,
 not_covered_flag boolean DEFAULT false, fee_paid_status text DEFAULT 'unpaid',
 fee_paid_amount numeric, fee_cash_paid_amount numeric, fee_advance_offset_amount numeric,
 fee_unallocated_amount numeric, fee_paid_at timestamptz, fee_paid_by uuid,
 fee_payment_method text, fee_payment_notes text, fee_receipt_url text,
 fee_receipt_uploaded_at timestamptz, fee_receipt_uploaded_by uuid,
 fee_payment_reference text, fee_pre_fund_id uuid, wfp_override_by uuid,
 wfp_override_justification text, wfp_override_at timestamptz,
 attribution_collector_id uuid, attribution_status text DEFAULT 'unresolved'
);
CREATE TABLE wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL,
 balances jsonb DEFAULT '{"SDG":0}', total_earned numeric DEFAULT 0,
 total_earned_cents bigint DEFAULT 0, balance_cents bigint DEFAULT 0,
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE wallet_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid, user_id uuid,
 type wallet_tx_type, amount numeric, amount_cents bigint, currency text,
 site_visit_id uuid, related_site_visit_id uuid, description text,
 balance_before numeric, balance_after numeric, status text, metadata jsonb,
 created_at timestamptz DEFAULT now()
);
CREATE TABLE down_payment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by uuid, status text,
 total_paid_amount numeric, approved_amount numeric, requested_amount numeric,
 metadata jsonb DEFAULT '{}', mmp_site_entry_id uuid, site_visit_id uuid,
 site_name text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE pre_fund_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_table text, source_id uuid,
 transaction_type text, amount numeric, currency text DEFAULT 'SDG',
 source_is_verified boolean DEFAULT true, reversal_of_id uuid,
 transaction_date date DEFAULT current_date, created_at timestamptz DEFAULT now()
);
CREATE TABLE acct_gl_bridge_log (
 source_table text, source_id text, event_type text, status text,
 journal_entry_id uuid, error_message text
);
CREATE TABLE fake_journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid)
RETURNS uuid LANGUAGE sql AS $$ INSERT INTO fake_journals DEFAULT VALUES RETURNING id $$;
CREATE FUNCTION can_manage_covered_fee_payments() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION has_active_enumerator_fee_bridge(uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION acct_trig_mmp_site_entries_fee_paid() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
-- Exact workflow signature used by the protected payment centre.  The harness
-- calls it with a genuine receipt URL, not synthetic manual:// evidence.
CREATE FUNCTION record_covered_enumerator_fee_payments(jsonb,text,date,text,text,text,uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE x jsonb; sid uuid;
BEGIN
 FOR x IN SELECT * FROM jsonb_array_elements($1) LOOP
   sid := (x->>'site_id')::uuid;
   UPDATE mmp_site_entries SET fee_paid_status='paid',
     fee_paid_amount=(x->>'amount')::numeric, fee_cash_paid_amount=(x->>'amount')::numeric,
     fee_paid_at=coalesce($3,current_date), fee_paid_by=auth.uid(),
     fee_receipt_url=$4 WHERE id=sid AND lower(trim(status))='wfp_confirmed';
 END LOOP;
 RETURN '{"ok":true}'::jsonb;
END $$;
SQL

# A legacy normal row carrying both references to the same site must count once
# during preflight.  (The duplicate-failure fixture is exercised below against
# the installed canonical index with two distinct transaction IDs.)
"${P[@]}" <<'SQL'
INSERT INTO wallet_transactions(user_id,type,amount,amount_cents,site_visit_id,related_site_visit_id)
 VALUES ('00000000-0000-0000-0000-000000000002','earning',3,300,
         '30000000-0000-0000-0000-000000000099',
         '30000000-0000-0000-0000-000000000099');
SQL

"${P[@]}" -f "$ROOT/supabase/migrations/20260910_wfp_confirmed_fee_gating.sql" >/dev/null

"${P[@]}" <<'SQL'
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION record_covered_enumerator_fee_payments(jsonb,text,date,text,text,text,uuid) TO authenticated;
RESET ROLE;
CREATE FUNCTION seed_earning(uuid,uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  ALTER TABLE wallet_transactions DISABLE TRIGGER trg_guard_ordinary_site_wallet_insert;
  INSERT INTO wallet_transactions(user_id,type,amount,amount_cents,site_visit_id)
    VALUES ($1,'earning',15,1500,$2);
  ALTER TABLE wallet_transactions ENABLE TRIGGER trg_guard_ordinary_site_wallet_insert;
END $$;
CREATE FUNCTION seed_related_duplicate(uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  ALTER TABLE wallet_transactions DISABLE TRIGGER trg_guard_ordinary_site_wallet_insert;
  INSERT INTO wallet_transactions(user_id,type,amount,amount_cents,related_site_visit_id)
    VALUES (auth.uid(),'earning',15,1500,$1);
  ALTER TABLE wallet_transactions ENABLE TRIGGER trg_guard_ordinary_site_wallet_insert;
END $$;
SET ROLE authenticated;
INSERT INTO profiles VALUES
 ('00000000-0000-0000-0000-000000000001','Finance'),
 ('00000000-0000-0000-0000-000000000002','Enumerator');
INSERT INTO mmp_files VALUES ('10000000-0000-0000-0000-000000000001',NULL);

-- Hostile ordinary writes are denied, including no-site and UPDATE mutation.
DO $$
BEGIN
  BEGIN INSERT INTO wallet_transactions(user_id,type,amount,amount_cents)
    VALUES (auth.uid(),'earning',1,100); RAISE EXCEPTION 'no-site insert passed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ORDINARY_SITE_EARNING_TRUSTED_PATH_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

-- Seed a non-WFP row and verify both paid INSERT and UPDATE guards.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000001','submitted',
         '00000000-0000-0000-0000-000000000002',10,5,'Legacy',
         '00000000-0000-0000-0000-000000000002','auto');
DO $$
BEGIN
 BEGIN INSERT INTO mmp_site_entries(id,status,fee_paid_status)
   VALUES ('30000000-0000-0000-0000-000000000002','submitted','paid');
   RAISE EXCEPTION 'paid insert passed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'FEE_PAID_REQUIRES_WFP_CONFIRMED%' THEN RAISE; END IF;
 END;
 BEGIN UPDATE mmp_site_entries SET fee_paid_status='paid';
   RAISE EXCEPTION 'paid update passed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'FEE_PAID_REQUIRES_WFP_CONFIRMED%' THEN RAISE; END IF;
 END;
END $$;

-- Existing earning must prevent advance mutation.
SELECT seed_earning(auth.uid(),'30000000-0000-0000-0000-000000000001');
INSERT INTO down_payment_requests(requested_by,status,total_paid_amount,mmp_site_entry_id)
 VALUES ('00000000-0000-0000-0000-000000000002','approved',5,'30000000-0000-0000-0000-000000000001');
UPDATE mmp_site_entries SET status='wfp_confirmed';
DO $$ BEGIN
 IF (SELECT metadata ? 'advance_reconciled_at' FROM down_payment_requests) THEN
   RAISE EXCEPTION 'old earning reconciled advance';
 END IF;
END $$;

-- Positive WFP credit and protected payment workflow with genuine receipt.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000003','submitted',
         '00000000-0000-0000-0000-000000000002',10,5,'Confirmed',
         '00000000-0000-0000-0000-000000000002','auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name)
 VALUES ('00000000-0000-0000-0000-000000000002','fully_paid',
         '30000000-0000-0000-0000-000000000003','Confirmed');
INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency)
 SELECT 'down_payment_requests',id,'payment',5,'SDG'
   FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003';
UPDATE mmp_site_entries SET status='WFP_CONFIRMED' WHERE id='30000000-0000-0000-0000-000000000003';
SELECT record_covered_enumerator_fee_payments(
 '[{"site_id":"30000000-0000-0000-0000-000000000003","amount":10}]',
 'Cash',current_date,'https://receipts.example/real.pdf','ref','note',NULL);

DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO site_advance_applications
      (mmp_site_entry_id,down_payment_request_id,recipient_id,gross_cents,applied_cents,
       remaining_paid_cents,source_payment_ids)
    VALUES ('30000000-0000-0000-0000-000000000003',
            (SELECT id FROM down_payment_requests
              WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003'),
            auth.uid(),1500,1,4,'[]');
    RAISE EXCEPTION 'ledger client insert passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE site_advance_applications SET applied_cents=99;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'ledger client update passed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DO $$ BEGIN
 IF (SELECT fee_advance_offset_amount FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000003') <> 5
 OR (SELECT fee_cash_paid_amount FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000003') <> 10
 THEN RAISE EXCEPTION 'advance offset/payment projection mismatch'; END IF;
END $$;
DO $$
DECLARE rid uuid;
BEGIN
 rid := (SELECT id FROM down_payment_requests
          WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003');
 BEGIN
   INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,
                                      currency,source_is_verified,reversal_of_id)
   VALUES ('down_payment_requests',rid,'reversal',1,'SDG',true,NULL);
   RAISE EXCEPTION 'applied advance reversal passed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'ADVANCE_REVERSAL_BLOCKED%' THEN RAISE; END IF;
 END;
 INSERT INTO down_payment_requests(requested_by,status) VALUES (auth.uid(),'fully_paid')
 RETURNING id INTO rid;
 INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,
                                   currency,source_is_verified)
 VALUES ('down_payment_requests',rid,'reversal',1,'SDG',true);
END $$;

-- Canonical uniqueness covers the legacy related_site_visit_id column too.
DO $$
BEGIN
  BEGIN
    PERFORM seed_related_duplicate('30000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'related-site duplicate passed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '23505' THEN RAISE; END IF;
  END;
END $$;

-- Direct UPDATE mutation remains blocked (the guard does not trust metadata).
DO $$
BEGIN
 BEGIN UPDATE wallet_transactions SET amount=99 WHERE type='earning';
   RAISE EXCEPTION 'earning update passed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'ORDINARY_SITE_EARNING_TRUSTED_PATH_REQUIRED%' THEN RAISE; END IF;
 END;
END $$;

-- Bonus remains unaffected.
INSERT INTO wallet_transactions(user_id,type,amount,amount_cents)
 VALUES (auth.uid(),'bonus',7,700);
DO $$ BEGIN
 IF (SELECT count(*) FROM wallet_transactions WHERE type='bonus') <> 1
 THEN RAISE EXCEPTION 'bonus transaction changed'; END IF;
END $$;

DO $$ BEGIN
 IF (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='30000000-0000-0000-0000-000000000003') <> 1
 OR (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-000000000002') <> 1000
 OR (SELECT amount_cents FROM wallet_transactions
       WHERE site_visit_id='30000000-0000-0000-0000-000000000003') <> 1000
 OR NOT ((SELECT metadata FROM wallet_transactions
            WHERE site_visit_id='30000000-0000-0000-0000-000000000003')
           ? 'gross_cents')
 OR NOT ((SELECT metadata FROM wallet_transactions
            WHERE site_visit_id='30000000-0000-0000-0000-000000000003')
           ? 'advance_application_ids')
 THEN RAISE EXCEPTION 'WFP earning/wallet mismatch'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname='trg_mmp_site_fee_gl_post') <> 1
 THEN RAISE EXCEPTION 'GL trigger inventory mismatch'; END IF;
END $$;
SELECT 'actual migration WFP fee gating: PASS';
SQL