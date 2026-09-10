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
 reversal_of_id uuid, transaction_date date DEFAULT current_date,
 created_at timestamptz DEFAULT now(), metadata jsonb DEFAULT '{}'::jsonb
);
-- Production-shaped canonical read model. Verification is derived from the
-- source, never stored on the immutable base event.
CREATE VIEW pre_fund_event_ledger_v AS
SELECT t.id, t.source_table, t.source_id, t.transaction_type, t.amount,
       t.currency, t.transaction_date, t.created_at, t.reversal_of_id,
       CASE
         WHEN t.source_table = 'down_payment_requests' THEN
           d.id IS NOT NULL
           AND d.status IN ('partially_paid','fully_paid','paid','reconciled')
           AND coalesce((d.metadata->>'deleted')::boolean,false)=false
         WHEN t.source_table IS NULL THEN true
         ELSE false
       END AS source_is_verified,
       CASE WHEN t.transaction_type='payment' THEN t.amount
            WHEN t.transaction_type='return' THEN -t.amount
            WHEN t.transaction_type='reversal' AND
                 (t.source_table IS NOT NULL OR o.id IS NOT NULL)
              THEN -t.amount ELSE 0 END AS signed_paid_amount
  FROM pre_fund_transactions t
  LEFT JOIN down_payment_requests d ON d.id=t.source_id
   AND t.source_table='down_payment_requests'
  LEFT JOIN pre_fund_transactions o ON o.id=t.reversal_of_id;
CREATE TABLE acct_gl_bridge_log (
 source_table text, source_id text, event_type text, status text,
 journal_entry_id uuid, error_message text
);
CREATE TABLE cycle_exception_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 redirect_fee_site_entry_id uuid, mmp_site_entry_id uuid, decision text,
 executed boolean DEFAULT false, correction_status text,
 redirect_fee_settled_amount numeric, decision_amount numeric, advance_amount numeric
);
CREATE TABLE cycle_exception_action_allocations (
 action_id uuid REFERENCES cycle_exception_actions(id),
 target_site_id uuid, amount numeric
);
CREATE TABLE fake_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lines jsonb
);
CREATE TABLE gl_stub_calls (
  id bigint GENERATED ALWAYS AS IDENTITY,
  site_id uuid,
  amount numeric NOT NULL
);
CREATE FUNCTION acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid,uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE j uuid;
BEGIN
 IF current_setting('app.gl_fail',true)='on' THEN
   RAISE EXCEPTION 'GL_STUB_FAILURE';
 END IF;
 INSERT INTO fake_journals(lines) VALUES ($7) RETURNING id INTO j;
 RETURN j;
END $$;
CREATE FUNCTION can_manage_covered_fee_payments() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION has_active_enumerator_fee_bridge(uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION acct_trig_mmp_site_entries_fee_paid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.gl_fail',true)='on' THEN
    RAISE EXCEPTION 'GL_STUB_FAILURE';
  END IF;
  INSERT INTO gl_stub_calls(site_id,amount)
  VALUES (NEW.id,coalesce(NEW.fee_paid_amount,NEW.enumerator_fee+NEW.transport_fee));
  RETURN NEW;
END $$;
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
-- Legacy application fixture proves migration backfill/rename behavior.
INSERT INTO profiles(id,role) VALUES
 ('00000000-0000-0000-0000-000000000002','Enumerator');
INSERT INTO mmp_site_entries(id,status,enumerator_fee,transport_fee)
 VALUES ('30000000-0000-0000-0000-000000000009','submitted',1,1);
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id)
 VALUES ('00000000-0000-0000-0000-000000000002','fully_paid',
         '30000000-0000-0000-0000-000000000009');
CREATE TABLE site_advance_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mmp_site_entry_id uuid NOT NULL REFERENCES mmp_site_entries(id),
 down_payment_request_id uuid NOT NULL REFERENCES down_payment_requests(id),
 recipient_id uuid NOT NULL REFERENCES profiles(id),
 gross_cents bigint NOT NULL, applied_cents bigint NOT NULL,
 remaining_paid_cents bigint NOT NULL,
 source_payment_ids jsonb NOT NULL, wallet_transaction_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(mmp_site_entry_id,down_payment_request_id)
);
INSERT INTO site_advance_applications
 (mmp_site_entry_id,down_payment_request_id,recipient_id,gross_cents,applied_cents,
  remaining_paid_cents,source_payment_ids)
 SELECT mmp_site_entry_id,id,requested_by,200,2,0,'[]'::jsonb
 FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000009';
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
# Re-apply the migration before exercising the workflow; policy creation,
# compatibility renames, indexes, and triggers must all be idempotent.
"${P[@]}" -f "$ROOT/supabase/migrations/20260910_wfp_confirmed_fee_gating.sql" >/dev/null

"${P[@]}" <<'SQL'
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION record_covered_enumerator_fee_payments(jsonb,text,date,text,text,text,uuid) TO authenticated;
RESET ROLE;
CREATE FUNCTION harness_prefund_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR to_jsonb(OLD)-ARRAY['reconciled','reconciled_at']
    IS DISTINCT FROM to_jsonb(NEW)-ARRAY['reconciled','reconciled_at'] THEN
   RAISE EXCEPTION 'Pre-fund payment events are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER harness_prefund_immutable
BEFORE UPDATE OR DELETE ON pre_fund_transactions
FOR EACH ROW EXECUTE FUNCTION harness_prefund_immutable();
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
CREATE FUNCTION seed_prefund_payment(uuid,numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE x uuid;
BEGIN
 INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency)
 VALUES ('down_payment_requests',$1,'payment',$2,'SDG') RETURNING id INTO x;
 RETURN x;
END $$;
CREATE FUNCTION seed_prefund_reversal(uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE x uuid;
BEGIN
 INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency,reversal_of_id)
 SELECT source_table,source_id,'reversal',amount,currency,id
   FROM pre_fund_transactions WHERE id=$1
 RETURNING id INTO x;
 RETURN x;
END $$;
CREATE FUNCTION seed_prefund_return(uuid,numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE x uuid;
BEGIN
 INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency,reversal_of_id)
 SELECT source_table,source_id,'return',$2,currency,id
   FROM pre_fund_transactions WHERE id=$1
 RETURNING id INTO x;
 RETURN x;
END $$;
CREATE FUNCTION seed_prefund_event(uuid,text,numeric,text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE x uuid;
BEGIN
 INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency)
 VALUES ('down_payment_requests',$1,$2,$3,$4) RETURNING id INTO x;
 RETURN x;
END $$;
CREATE FUNCTION seed_redirect_settlement(uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 ALTER TABLE mmp_site_entries DISABLE TRIGGER trigger_create_wallet_transaction_on_completion;
 UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id=$1;
 ALTER TABLE mmp_site_entries ENABLE TRIGGER trigger_create_wallet_transaction_on_completion;
 PERFORM set_config('app.wfp_wallet_settlement','on',true);
 UPDATE mmp_site_entries SET fee_paid_status='paid',fee_paid_amount=10,
   fee_cash_paid_amount=0,fee_advance_offset_amount=10,fee_wallet_credit_amount=0
  WHERE id=$1;
 PERFORM set_config('app.wfp_wallet_settlement','off',true);
END $$;
CREATE FUNCTION seed_redirect_partial(uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 ALTER TABLE mmp_site_entries DISABLE TRIGGER trigger_create_wallet_transaction_on_completion;
 UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id=$1;
 ALTER TABLE mmp_site_entries ENABLE TRIGGER trigger_create_wallet_transaction_on_completion;
 PERFORM set_config('app.wfp_wallet_settlement','on',true);
 UPDATE mmp_site_entries SET fee_paid_status='paid',fee_paid_amount=10,
   fee_cash_paid_amount=4,fee_advance_offset_amount=6,fee_wallet_credit_amount=0
  WHERE id=$1;
 PERFORM set_config('app.wfp_wallet_settlement','off',true);
END $$;
CREATE FUNCTION attempt_redirect_components(uuid,numeric,numeric,numeric,numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 PERFORM set_config('app.wfp_wallet_settlement','on',true);
 UPDATE mmp_site_entries SET fee_paid_status='unpaid' WHERE id=$1;
 UPDATE mmp_site_entries SET fee_paid_status='paid',fee_paid_amount=$5,
   fee_cash_paid_amount=$2,fee_advance_offset_amount=$3,fee_wallet_credit_amount=$4
  WHERE id=$1;
 PERFORM set_config('app.wfp_wallet_settlement','off',true);
END $$;
SET ROLE authenticated;
INSERT INTO profiles VALUES
 ('00000000-0000-0000-0000-000000000001','Finance'),
  ('00000000-0000-0000-0000-000000000002','Enumerator')
 ON CONFLICT (id) DO NOTHING;
INSERT INTO mmp_files VALUES ('10000000-0000-0000-0000-000000000001',NULL);
INSERT INTO down_payment_requests(requested_by,status)
 VALUES (auth.uid(),'approved');
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000029','submitted',auth.uid(),3,0,'Combined attack',
         auth.uid(),'auto');
DO $$
BEGIN
 BEGIN
   UPDATE mmp_site_entries SET status='wfp_confirmed',fee_paid_status='paid',
     fee_paid_amount=3,fee_cash_paid_amount=3,
    fee_payment_reference='forged',fee_receipt_url='https://forged.example/x'
   WHERE id='30000000-0000-0000-0000-000000000029';
  RAISE EXCEPTION 'combined WFP confirmation projection passed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'WFP_CONFIRMATION_FINANCIAL_PROJECTION_FORBIDDEN%' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000029') <> 'submitted'
 OR EXISTS (SELECT 1 FROM wallet_transactions
             WHERE site_visit_id='30000000-0000-0000-0000-000000000029')
 OR EXISTS (SELECT 1 FROM site_advance_applications a
             WHERE a.mmp_site_entry_id='30000000-0000-0000-0000-000000000029')
 THEN RAISE EXCEPTION 'combined attack left financial state'; END IF;
END $$;

DO $$
 BEGIN
 BEGIN
  INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,currency)
  VALUES ('down_payment_requests',
          (SELECT id FROM down_payment_requests ORDER BY id DESC LIMIT 1),
          'payment',1,'SDG');
  RAISE EXCEPTION 'direct down-payment payment passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'DOWN_PAYMENT_PAYMENT_TRUSTED_PATH_REQUIRED%' THEN RAISE; END IF;
 END;
END $$;
DO $$
DECLARE pid uuid; rid uuid;
BEGIN
 INSERT INTO down_payment_requests(requested_by,status) VALUES (auth.uid(),'fully_paid')
  RETURNING id INTO rid;
 pid := seed_prefund_payment(rid,1);
 BEGIN
  UPDATE pre_fund_transactions SET amount=2 WHERE id=pid;
  RAISE EXCEPTION 'authenticated ledger update passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Pre-fund payment events are immutable%'
     AND SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
 END;
 BEGIN
  DELETE FROM pre_fund_transactions WHERE id=pid;
  RAISE EXCEPTION 'authenticated ledger delete passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Pre-fund payment events are immutable%'
     AND SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
 END;
END $$;

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
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id='30000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM down_payment_requests
              WHERE metadata ? 'advance_reconciled_at') THEN
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
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
  WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003'),5);
UPDATE mmp_site_entries SET status='WFP_CONFIRMED' WHERE id='30000000-0000-0000-0000-000000000003';
DO $$
BEGIN
 BEGIN
  UPDATE mmp_site_entries SET fee_wallet_credit_amount=99
   WHERE id='30000000-0000-0000-0000-000000000003';
  RAISE EXCEPTION 'wallet component forgery passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'WFP_WALLET_COMPONENT_TRUSTED_PATH_REQUIRED%'
     AND SQLERRM NOT LIKE 'WFP_SETTLED_FINANCIAL_FIELDS_IMMUTABLE%' THEN RAISE; END IF;
 END;
END $$;

DO $$
BEGIN
 BEGIN
  PERFORM record_covered_enumerator_fee_payments(
   '[{"site_id":"30000000-0000-0000-0000-000000000003","amount":10}]',
   'Cash',current_date,'https://receipts.example/real.pdf','ref','note',NULL);
  RAISE EXCEPTION 'direct payment double-pay passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'DIRECT_PAYMENT_BLOCKED_WALLET_SETTLED%' THEN RAISE; END IF;
 END;
END $$;

DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO site_advance_applications
      (mmp_site_entry_id,down_payment_request_id,recipient_id,gross_cents,applied_cents,
        application_residual_cents,source_payment_ids)
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
        WHERE id='30000000-0000-0000-0000-000000000003') <> 0
 THEN RAISE EXCEPTION 'advance offset/payment projection mismatch'; END IF;
END $$;
DO $$
DECLARE rid uuid := (SELECT id FROM down_payment_requests
  WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003');
BEGIN
 FOR i IN 1..5 LOOP
  BEGIN
   IF i=1 THEN UPDATE down_payment_requests SET status='cancelled' WHERE id=rid;
   ELSIF i=2 THEN UPDATE down_payment_requests SET metadata='{"deleted":true}' WHERE id=rid;
   ELSIF i=3 THEN UPDATE down_payment_requests SET requested_by=gen_random_uuid() WHERE id=rid;
   ELSIF i=4 THEN UPDATE down_payment_requests SET mmp_site_entry_id=gen_random_uuid() WHERE id=rid;
   ELSE DELETE FROM down_payment_requests WHERE id=rid;
   END IF;
   RAISE EXCEPTION 'post-application source mutation passed (%).', i;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'ADVANCE_SOURCE_IMMUTABLE%'
      AND SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
DO $$
DECLARE rid uuid;
BEGIN
 rid := (SELECT id FROM down_payment_requests
          WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000003');
 BEGIN
   INSERT INTO pre_fund_transactions(source_table,source_id,transaction_type,amount,
                                       currency,reversal_of_id)
    VALUES ('down_payment_requests',rid,'reversal',1,'SDG',NULL);
   RAISE EXCEPTION 'applied advance reversal passed';
 EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ADVANCE_REVERSAL_INVALID%' THEN RAISE; END IF;
 END;
  INSERT INTO down_payment_requests(requested_by,status,total_paid_amount)
    VALUES (auth.uid(),'fully_paid',1) RETURNING id INTO rid;
  rid := seed_prefund_payment(rid,1);
 PERFORM seed_prefund_reversal(rid);
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

-- Full advance coverage settles the fee projection without creating a
-- zero-value wallet earning.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000004','submitted',
         auth.uid(),10,5,'Fully covered',auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000004','Fully covered');
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
  WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000004'),15);
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id='30000000-0000-0000-0000-000000000004';
DO $$
BEGIN
 IF (SELECT fee_paid_status FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000004') <> 'paid'
 OR (SELECT fee_paid_amount FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000004') <> 15
 OR (SELECT fee_cash_paid_amount FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000004') <> 0
 OR (SELECT fee_advance_offset_amount FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000004') <> 15
 OR (SELECT count(*) FROM wallet_transactions
       WHERE site_visit_id='30000000-0000-0000-0000-000000000004') <> 0
 OR (SELECT count(*) FROM acct_gl_bridge_log
       WHERE source_id='30000000-0000-0000-0000-000000000004'
         AND status='success') <> 1
 OR (SELECT count(*) FROM acct_gl_bridge_log
       WHERE source_id='30000000-0000-0000-0000-000000000004'
         AND status='error') <> 0
 THEN RAISE EXCEPTION 'full advance did not settle without zero wallet'; END IF;
END $$;

DO $$
DECLARE l jsonb; dr numeric; cr numeric;
BEGIN
 SELECT j.lines INTO l
   FROM acct_gl_bridge_log g JOIN fake_journals j ON j.id=g.journal_entry_id
  WHERE g.source_id='30000000-0000-0000-0000-000000000004'
    AND g.status='success' LIMIT 1;
 SELECT coalesce(sum((x->>'amount')::numeric),0) INTO dr
   FROM jsonb_array_elements(l) x WHERE x->>'debit_credit'='DR';
 SELECT coalesce(sum((x->>'amount')::numeric),0) INTO cr
   FROM jsonb_array_elements(l) x WHERE x->>'debit_credit'='CR';
 IF dr<>15 OR cr<>15 OR NOT (l @> '[{"account_code":"2600","debit_credit":"CR"}]'::jsonb)
 THEN RAISE EXCEPTION 'ordinary GL lines are not balanced or missing wallet payable'; END IF;
END $$;

-- A GL failure is caught and recorded by the production bridge contract while
-- the atomic wallet/site settlement remains internally consistent.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000005','submitted',
         auth.uid(),10,5,'GL rollback',auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000005','GL rollback');
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
  WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000005'),15);
DO $$
BEGIN
 PERFORM set_config('app.gl_fail','on',true);
 UPDATE mmp_site_entries SET status='wfp_confirmed'
  WHERE id='30000000-0000-0000-0000-000000000005';
 IF (SELECT status FROM mmp_site_entries
       WHERE id='30000000-0000-0000-0000-000000000005') <> 'wfp_confirmed'
 THEN RAISE EXCEPTION 'GL failure did not preserve caught workflow state'; END IF;
 IF (SELECT count(*) FROM acct_gl_bridge_log
       WHERE source_id='30000000-0000-0000-0000-000000000005'
         AND status='error') <> 1
 THEN RAISE EXCEPTION 'GL failure was not recorded'; END IF;
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

-- A: two immutable instalments are netted before one deterministic application.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000010','submitted',auth.uid(),10,5,'Installments',
         auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000010','Installments');
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
 WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000010'),4);
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
 WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000010'),3);
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id='30000000-0000-0000-0000-000000000010';
DO $$ BEGIN
 IF (SELECT sum(applied_cents) FROM site_advance_applications a
      JOIN down_payment_requests d ON d.id=a.down_payment_request_id
     WHERE d.mmp_site_entry_id='30000000-0000-0000-0000-000000000010')<>700
 OR (SELECT site_fee_applied_cents FROM down_payment_requests d
      WHERE d.mmp_site_entry_id='30000000-0000-0000-0000-000000000010')<>700
 THEN RAISE EXCEPTION 'instalments were not netted'; END IF;
END $$;

-- B: two advances are applied in UUID order and each evidence row is distinct.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000011','submitted',auth.uid(),10,5,'Two advances',
         auth.uid(),'auto');
INSERT INTO down_payment_requests(id,requested_by,status,mmp_site_entry_id,site_name)
 VALUES ('40000000-0000-0000-0000-000000000001',auth.uid(),'fully_paid',
         '30000000-0000-0000-0000-000000000011','Two advances'),
        ('40000000-0000-0000-0000-000000000002',auth.uid(),'fully_paid',
         '30000000-0000-0000-0000-000000000011','Two advances');
SELECT seed_prefund_payment('40000000-0000-0000-0000-000000000001',3);
SELECT seed_prefund_payment('40000000-0000-0000-0000-000000000002',4);
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id='30000000-0000-0000-0000-000000000011';
DO $$ BEGIN
 IF (SELECT array_agg(d.id ORDER BY d.id) FROM site_advance_applications a
       JOIN down_payment_requests d ON d.id=a.down_payment_request_id
      WHERE a.mmp_site_entry_id='30000000-0000-0000-0000-000000000011')
    <> ARRAY['40000000-0000-0000-0000-000000000001'::uuid,
             '40000000-0000-0000-0000-000000000002'::uuid]
 THEN RAISE EXCEPTION 'multiple advance order is not deterministic'; END IF;
END $$;

-- C/D: residual is current ledger net less applications; stale totals are not evidence.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000012','submitted',auth.uid(),3,0,'Residual',
         auth.uid(),'auto'), ('30000000-0000-0000-0000-000000000013','submitted',
         auth.uid(),3,0,'Stale totals',auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name,
 total_paid_amount,approved_amount)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000012','Residual',99,99),
        (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000013','Stale totals',99,99);
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
 WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000012'),5);
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id IN ('30000000-0000-0000-0000-000000000012',
              '30000000-0000-0000-0000-000000000013');
DO $$ BEGIN
 IF (SELECT current_residual_cents FROM site_advance_application_current_v
      WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000012')<>200
 OR (SELECT count(*) FROM site_advance_applications a
      JOIN down_payment_requests d ON d.id=a.down_payment_request_id
     WHERE d.mmp_site_entry_id='30000000-0000-0000-0000-000000000013')<>0
 THEN RAISE EXCEPTION 'current residual/stale totals assertion failed'; END IF;
END $$;

-- H: same-name requests for another site are never matched by name.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000030','submitted',auth.uid(),3,0,'Exact same name',
         auth.uid(),'auto'),
        ('30000000-0000-0000-0000-000000000031','submitted',auth.uid(),3,0,'Other',
         auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000030','Exact same name'),
        (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000031','Exact same name');
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
 WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000030'),1);
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests
 WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000031'),9);
UPDATE mmp_site_entries SET status='wfp_confirmed'
 WHERE id='30000000-0000-0000-0000-000000000030';
DO $$ BEGIN
 IF (SELECT coalesce(sum(a.applied_cents),0) FROM site_advance_applications a
      JOIN down_payment_requests d ON d.id=a.down_payment_request_id
     WHERE d.mmp_site_entry_id='30000000-0000-0000-0000-000000000030')<>100
 OR (SELECT count(*) FROM site_advance_applications a
      JOIN down_payment_requests d ON d.id=a.down_payment_request_id
     WHERE d.mmp_site_entry_id='30000000-0000-0000-0000-000000000031')<>0
 THEN RAISE EXCEPTION 'same-name request matched wrong site'; END IF;
END $$;

-- I: repeating the confirmed update is idempotent.
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM wallet_transactions
  WHERE site_visit_id='30000000-0000-0000-0000-000000000010';
 UPDATE mmp_site_entries SET status='wfp_confirmed'
  WHERE id='30000000-0000-0000-0000-000000000010';
 IF (SELECT count(*) FROM wallet_transactions
      WHERE site_visit_id='30000000-0000-0000-0000-000000000010')<>n
 THEN RAISE EXCEPTION 'retry was not idempotent'; END IF;
END $$;

-- E/F: reversal and return netting before settlement, plus mixed currency and
-- deleted-source fail-closed evidence.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000015','submitted',auth.uid(),3,0,'Net reversal',auth.uid(),'auto'),
        ('30000000-0000-0000-0000-000000000016','submitted',auth.uid(),3,0,'Net return',auth.uid(),'auto'),
        ('30000000-0000-0000-0000-000000000017','submitted',auth.uid(),3,0,'Mixed currency',auth.uid(),'auto'),
        ('30000000-0000-0000-0000-000000000018','submitted',auth.uid(),3,0,'Deleted source',auth.uid(),'auto');
INSERT INTO down_payment_requests(requested_by,status,mmp_site_entry_id,site_name,metadata)
 VALUES (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000015','Net reversal','{}'),
        (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000016','Net return','{}'),
        (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000017','Mixed currency','{}'),
        (auth.uid(),'fully_paid','30000000-0000-0000-0000-000000000018','Deleted source','{"deleted":true}');
SELECT seed_prefund_reversal(seed_prefund_payment((SELECT id FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000015'),3));
SELECT seed_prefund_return(seed_prefund_payment((SELECT id FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000016'),3),3);
SELECT seed_prefund_event((SELECT id FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000017'),'payment',3,'USD');
SELECT seed_prefund_payment((SELECT id FROM down_payment_requests WHERE mmp_site_entry_id='30000000-0000-0000-0000-000000000018'),3);
DO $$
BEGIN
 UPDATE mmp_site_entries SET status='wfp_confirmed'
  WHERE id IN ('30000000-0000-0000-0000-000000000015',
               '30000000-0000-0000-0000-000000000016');
 IF (SELECT count(*) FROM site_advance_applications a JOIN down_payment_requests d
      ON d.id=a.down_payment_request_id WHERE d.mmp_site_entry_id IN
      ('30000000-0000-0000-0000-000000000015','30000000-0000-0000-0000-000000000016'))<>0
 THEN RAISE EXCEPTION 'net-zero reversal/return created an application'; END IF;
 BEGIN
  UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='30000000-0000-0000-0000-000000000017';
  RAISE EXCEPTION 'mixed currency evidence passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'ADVANCE_EVIDENCE_INVALID%' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='30000000-0000-0000-0000-000000000018';
  RAISE EXCEPTION 'deleted source evidence passed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'ADVANCE_EVIDENCE_INVALID%' THEN RAISE; END IF;
 END;
END $$;

-- G: each attribution field independently fails closed.
DO $$
DECLARE i integer; sid uuid; bad uuid := gen_random_uuid();
BEGIN
 FOR i IN 1..4 LOOP
  sid := CASE i
    WHEN 1 THEN '30000000-0000-0000-0000-000000000021'::uuid
    WHEN 2 THEN '30000000-0000-0000-0000-000000000022'::uuid
    WHEN 3 THEN '30000000-0000-0000-0000-000000000023'::uuid
    ELSE '30000000-0000-0000-0000-000000000024'::uuid END;
  INSERT INTO mmp_site_entries(id,status,accepted_by,claimed_by,visit_started_by,visit_completed_by,
    enumerator_fee,transport_fee,site_name,attribution_collector_id,attribution_status)
   VALUES (sid,'submitted',auth.uid()::text,auth.uid(),auth.uid(),auth.uid(),3,0,'Attribution',
           auth.uid(),'auto');
  IF i=1 THEN UPDATE mmp_site_entries SET accepted_by=bad::text WHERE id=sid;
  ELSIF i=2 THEN UPDATE mmp_site_entries SET claimed_by=bad WHERE id=sid;
  ELSIF i=3 THEN UPDATE mmp_site_entries SET visit_started_by=bad WHERE id=sid;
  ELSE UPDATE mmp_site_entries SET visit_completed_by=bad WHERE id=sid;
  END IF;
  BEGIN
   UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id=sid;
   RAISE EXCEPTION 'attribution mismatch % passed',i;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'WFP_ATTRIBUTION_MISMATCH%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE site_visit_id=sid)
     OR EXISTS (SELECT 1 FROM site_advance_applications WHERE mmp_site_entry_id=sid)
  THEN RAISE EXCEPTION 'attribution mismatch % left settlement',i; END IF;
 END LOOP;
END $$;

-- L: redirect allocation uses authoritative offset, returns without an empty
-- journal at zero cash, then permits a later reprocessed cash transition.
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000014','submitted',auth.uid(),10,0,'Redirect',
         auth.uid(),'auto');
INSERT INTO cycle_exception_actions(id,redirect_fee_site_entry_id,decision,executed)
 VALUES ('50000000-0000-0000-0000-000000000001',
         '30000000-0000-0000-0000-000000000014','redirect',true);
INSERT INTO cycle_exception_action_allocations(action_id,target_site_id,amount)
 VALUES ('50000000-0000-0000-0000-000000000001',
         '30000000-0000-0000-0000-000000000014',10);
SELECT seed_redirect_settlement('30000000-0000-0000-0000-000000000014');
DO $$ BEGIN
 IF (SELECT count(*) FROM acct_gl_bridge_log
      WHERE source_id='30000000-0000-0000-0000-000000000014')<>0
 THEN RAISE EXCEPTION 'full-offset redirect created an empty journal'; END IF;
END $$;
-- Full-offset validation is not bypassed by the zero-cash return.
DO $$
DECLARE i integer;
BEGIN
 FOR i IN 1..4 LOOP
  UPDATE mmp_site_entries SET fee_paid_status='unpaid'
   WHERE id='30000000-0000-0000-0000-000000000014';
  BEGIN
   PERFORM set_config('app.wfp_wallet_settlement','on',true);
   IF i=1 THEN
    PERFORM attempt_redirect_components('30000000-0000-0000-0000-000000000014',0,10,0,9);
   ELSIF i=2 THEN
    PERFORM attempt_redirect_components('30000000-0000-0000-0000-000000000014',0,9,0,10);
   ELSIF i=3 THEN
    PERFORM attempt_redirect_components('30000000-0000-0000-0000-000000000014',1,10,0,10);
   ELSE
    PERFORM attempt_redirect_components('30000000-0000-0000-0000-000000000014',0,10,1,10);
   END IF;
   RAISE EXCEPTION 'full redirect malformed component % passed',i;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'Redirect fee completion components%' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
UPDATE cycle_exception_actions SET correction_status='reprocessed_payment_reversed'
 WHERE id='50000000-0000-0000-0000-000000000001';
UPDATE mmp_site_entries SET fee_paid_status='unpaid'
 WHERE id='30000000-0000-0000-0000-000000000014';
SELECT set_config('app.wfp_wallet_settlement','on',true);
UPDATE mmp_site_entries SET fee_paid_status='paid',fee_paid_amount=10,
 fee_cash_paid_amount=10,fee_advance_offset_amount=0,fee_wallet_credit_amount=0
 WHERE id='30000000-0000-0000-0000-000000000014';
SELECT set_config('app.wfp_wallet_settlement','off',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM acct_gl_bridge_log
      WHERE source_id='30000000-0000-0000-0000-000000000014'
        AND status='success')<>1
 THEN RAISE EXCEPTION 'reprocessed redirect cash transition did not post'; END IF;
END $$;
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('30000000-0000-0000-0000-000000000019','submitted',auth.uid(),10,0,'Redirect partial',
         auth.uid(),'auto');
INSERT INTO cycle_exception_actions(id,redirect_fee_site_entry_id,decision,executed)
 VALUES ('50000000-0000-0000-0000-000000000002',
         '30000000-0000-0000-0000-000000000019','redirect',true);
INSERT INTO cycle_exception_action_allocations(action_id,target_site_id,amount)
 VALUES ('50000000-0000-0000-0000-000000000002',
         '30000000-0000-0000-0000-000000000019',6);
SELECT seed_redirect_partial('30000000-0000-0000-0000-000000000019');
DO $$
DECLARE l jsonb;
BEGIN
 SELECT j.lines INTO l FROM acct_gl_bridge_log g JOIN fake_journals j
   ON j.id=g.journal_entry_id
  WHERE g.source_id='30000000-0000-0000-0000-000000000019'
    AND g.status='success';
 IF l IS NULL OR l @> '[{"account_code":"1510"}]'::jsonb
    OR l @> '[{"account_code":"2600"}]'::jsonb
    OR NOT l @> '[{"account_code":"5200","debit_credit":"DR","amount":4}]'::jsonb
 THEN RAISE EXCEPTION 'partial redirect journal shape invalid'; END IF;
END $$;

-- K: authorized-read policy converges and denies an unprivileged view caller.
RESET ROLE;
CREATE OR REPLACE FUNCTION can_manage_covered_fee_payments() RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT current_setting('app.can_manage',true)='on' $$;
SET ROLE authenticated;
SELECT set_config('app.can_manage','off',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM site_advance_application_current_v)<>0
 THEN RAISE EXCEPTION 'application view was readable without authorization'; END IF;
END $$;
SELECT set_config('app.can_manage','on',true);

SELECT 'actual migration WFP fee gating: PASS';
SQL

# N: actual competing settlement/reversal sessions on one fresh request.
RACE_SITE="30000000-0000-0000-0000-000000000025"
RACE_REQ="40000000-0000-0000-0000-000000000025"
"${P[@]}" <<SQL
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('$RACE_SITE','submitted',
         '00000000-0000-0000-0000-000000000002',5,0,'Race',
         '00000000-0000-0000-0000-000000000002','auto');
INSERT INTO down_payment_requests(id,requested_by,status,mmp_site_entry_id,site_name)
 VALUES ('$RACE_REQ','00000000-0000-0000-0000-000000000002','fully_paid',
         '$RACE_SITE','Race');
SELECT seed_prefund_payment('$RACE_REQ',3);
SQL
RACE_PAYMENT="$("${P[@]}" -At -c "SELECT id FROM pre_fund_transactions WHERE source_id='$RACE_REQ' AND transaction_type='payment'")"
"${P[@]}" -c "BEGIN; UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='$RACE_SITE'; SELECT pg_sleep(1); COMMIT;" >/tmp/wfp-race-a.out 2>&1 &
RACE_A=$!
sleep 0.2
RACE_START="$(date +%s%N)"
set +e
"${P[@]}" -c "SELECT seed_prefund_reversal('$RACE_PAYMENT');" >/tmp/wfp-race-b.out 2>&1
RACE_B_RC=$?
set -e
wait "$RACE_A"
RACE_END="$(date +%s%N)"
if [ "$RACE_B_RC" -eq 0 ] || ! grep -q 'ADVANCE_REVERSAL_BLOCKED' /tmp/wfp-race-b.out ||
   [ $((RACE_END-RACE_START)) -lt 500000000 ]; then
  echo "settlement/reversal race did not block and fail coherently" >&2
  cat /tmp/wfp-race-b.out >&2
  exit 1
fi
"${P[@]}" -c "SELECT site_fee_applied_cents,
  (SELECT count(*) FROM site_advance_applications WHERE down_payment_request_id='$RACE_REQ') AS applications,
  (SELECT count(*) FROM pre_fund_transactions WHERE reversal_of_id='$RACE_PAYMENT') AS reversals,
  (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='$RACE_SITE') AS wallet_rows
 FROM down_payment_requests WHERE id='$RACE_REQ';"
"${P[@]}" -c "DO \$\$ BEGIN
 IF (SELECT count(*) FROM site_advance_applications WHERE down_payment_request_id='$RACE_REQ')<>1
    OR (SELECT site_fee_applied_cents FROM down_payment_requests WHERE id='$RACE_REQ')<>300
    OR (SELECT count(*) FROM pre_fund_transactions WHERE reversal_of_id='$RACE_PAYMENT')<>0
    OR (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='$RACE_SITE')<>1
 THEN RAISE EXCEPTION 'race terminal state inconsistent'; END IF;
END \$\$;"

# O: reverse first in a competing transaction, then settle while reversal is
# uncommitted. Settlement must wait and use the fresh committed net evidence.
REVERSE_SITE="30000000-0000-0000-0000-000000000026"
REVERSE_REQ="40000000-0000-0000-0000-000000000026"
"${P[@]}" <<SQL
INSERT INTO mmp_site_entries(id,status,accepted_by,enumerator_fee,transport_fee,site_name,
 attribution_collector_id,attribution_status)
 VALUES ('$REVERSE_SITE','submitted','00000000-0000-0000-0000-000000000002',3,0,'Reverse first',
         '00000000-0000-0000-0000-000000000002','auto');
INSERT INTO down_payment_requests(id,requested_by,status,mmp_site_entry_id,site_name)
 VALUES ('$REVERSE_REQ','00000000-0000-0000-0000-000000000002','fully_paid',
         '$REVERSE_SITE','Reverse first');
SELECT seed_prefund_payment('$REVERSE_REQ',3);
SQL
REVERSE_PAYMENT="$("${P[@]}" -At -c "SELECT id FROM pre_fund_transactions WHERE source_id='$REVERSE_REQ' AND transaction_type='payment'")"
"${P[@]}" -c "BEGIN; SELECT seed_prefund_reversal('$REVERSE_PAYMENT'); SELECT pg_sleep(1); COMMIT;" >/tmp/wfp-reverse-first-a.out 2>&1 &
REVERSE_A=$!
sleep 0.2
REVERSE_START="$(date +%s%N)"
"${P[@]}" -c "UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='$REVERSE_SITE';"
REVERSE_END="$(date +%s%N)"
wait "$REVERSE_A"
if [ $((REVERSE_END-REVERSE_START)) -lt 500000000 ]; then
  echo "reverse-first settlement did not block" >&2
  exit 1
fi
"${P[@]}" -c "DO \$\$ BEGIN
 IF (SELECT count(*) FROM site_advance_applications WHERE down_payment_request_id='$REVERSE_REQ')<>0
    OR (SELECT site_fee_applied_cents FROM down_payment_requests WHERE id='$REVERSE_REQ')<>0
    OR (SELECT count(*) FROM pre_fund_transactions WHERE reversal_of_id='$REVERSE_PAYMENT')<>1
    OR (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='$REVERSE_SITE')<>1
    OR (SELECT fee_paid_status FROM mmp_site_entries WHERE id='$REVERSE_SITE')<>'paid'
 THEN RAISE EXCEPTION 'reverse-first concurrent settlement inconsistent'; END IF;
END \$\$;"
echo "fixture-backed settlement/reversal race: PASS"