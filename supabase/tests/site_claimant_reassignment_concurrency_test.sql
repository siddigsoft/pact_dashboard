-- Fixture-backed checks for 20260919120000_site_claimant_reassignment.sql.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, full_name text, role text, is_active boolean DEFAULT true,
  hub_id uuid
);
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user AND role='Super Admin' AND is_active)
$$;
CREATE TABLE public.mmp_site_entries (
  id uuid PRIMARY KEY, accepted_by uuid, claimed_by uuid, status text DEFAULT 'completed',
  additional_data jsonb DEFAULT '{}'::jsonb, hub_office uuid,
  fee_paid_status text, fee_cash_paid_amount numeric DEFAULT 0,
  fee_wallet_credit_amount numeric DEFAULT 0
);
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_earned_cents bigint NOT NULL DEFAULT 0,
  total_paid_out_cents bigint NOT NULL DEFAULT 0,
  balances jsonb DEFAULT '{"SDG":0}'::jsonb,
  total_earned numeric DEFAULT 0, total_withdrawn numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES public.wallets(id), user_id uuid NOT NULL REFERENCES public.profiles(id),
  amount_cents bigint NOT NULL, currency text DEFAULT 'SDG', type text NOT NULL,
  status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now(),
  posted_at timestamptz, memo text, related_site_visit_id uuid REFERENCES public.mmp_site_entries(id),
  amount numeric, site_visit_id uuid REFERENCES public.mmp_site_entries(id),
  description text, metadata jsonb, balance_before numeric, balance_after numeric,
  created_by uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.site_advance_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id uuid REFERENCES public.mmp_site_entries(id), applied_cents bigint DEFAULT 0
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.profiles(id),
  title text, message text, type text, link text, related_entity_id text,
  related_entity_type text
);

-- Production's trusted ordinary earning guard runs before the claimant guard
-- by trigger name and takes a site-row lock.
CREATE OR REPLACE FUNCTION public.guard_ordinary_site_wallet_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
 v_site_id uuid := coalesce(NEW.site_visit_id,NEW.related_site_visit_id);
 v_status text;
BEGIN
 IF coalesce(NEW.type,'') NOT IN ('earning','site_visit_fee') THEN RETURN NEW; END IF;
 IF v_site_id IS NULL THEN RAISE EXCEPTION 'ORDINARY_SITE_EARNING_REQUIRES_SITE_REFERENCE'; END IF;
 SELECT lower(trim(coalesce(status,''))) INTO v_status
 FROM mmp_site_entries WHERE id=v_site_id FOR SHARE;
 IF v_status IS DISTINCT FROM 'wfp_confirmed' THEN
  RAISE EXCEPTION 'ORDINARY_SITE_EARNING_REQUIRES_WFP_CONFIRMED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_ordinary_site_wallet_insert
BEFORE INSERT OR UPDATE ON wallet_transactions
FOR EACH ROW EXECUTE FUNCTION guard_ordinary_site_wallet_insert();

\ir ../migrations/20260919120000_site_claimant_reassignment.sql

CREATE TRIGGER trigger_update_wallet_balance
AFTER INSERT OR UPDATE ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_wallet_balance();

CREATE OR REPLACE FUNCTION public.test_settle_site_on_confirmation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO wallet_transactions(wallet_id,user_id,amount_cents,type,status,site_visit_id,amount)
 SELECT id,user_id,1100,'earning','posted',NEW.id,11
 FROM wallets WHERE user_id=NEW.accepted_by;
 RETURN NEW;
END $$;
CREATE TRIGGER trigger_test_settle_site_on_confirmation
AFTER UPDATE OF status ON mmp_site_entries
FOR EACH ROW WHEN (NEW.status='wfp_confirmed' AND OLD.status<>'wfp_confirmed')
EXECUTE FUNCTION test_settle_site_on_confirmation();

INSERT INTO profiles(id,full_name,role) VALUES
 ('00000000-0000-0000-0000-000000000001','Admin','Super Admin'),
 ('00000000-0000-0000-0000-00000000000a','Collector A','Data Collector'),
 ('00000000-0000-0000-0000-00000000000b','Collector B','Data Collector'),
 ('00000000-0000-0000-0000-00000000000c','Collector C','Data Collector'),
 ('00000000-0000-0000-0000-00000000000d','Supervisor','Supervisor');
INSERT INTO wallets(user_id) SELECT id FROM profiles WHERE role='Data Collector';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

INSERT INTO mmp_site_entries(id,accepted_by,status) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','completed'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','wfp_confirmed'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','wfp_confirmed'),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000000a','completed'),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000000a','completed');

-- Unpaid reassignment and retry preserve one audit decision and one notification set.
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-00000000000b','Correct unpaid claimant','unpaid-1');
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-00000000000b','Retry same request','unpaid-1');
DO $$ BEGIN
 IF (SELECT count(*) FROM site_claimant_reassignments WHERE site_entry_id='10000000-0000-0000-0000-000000000001')<>1
    OR (SELECT effective_claimant_id FROM site_effective_claimants WHERE site_entry_id='10000000-0000-0000-0000-000000000001')
       <>'00000000-0000-0000-0000-00000000000b'
    OR (SELECT count(*) FROM notifications WHERE related_entity_id='10000000-0000-0000-0000-000000000001')<>3
 THEN RAISE EXCEPTION 'unpaid retry reconciliation failed'; END IF;
END $$;

-- Paid A -> B -> C transfers the original earning exactly once per hop.
INSERT INTO wallet_transactions(wallet_id,user_id,amount_cents,type,status,site_visit_id,amount)
SELECT id,user_id,1000,'earning','posted','10000000-0000-0000-0000-000000000002',10
FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000a';
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-00000000000b','First paid transfer','paid-ab');
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-00000000000c','Second paid transfer','paid-bc');
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-00000000000b','Late retry of first transfer','paid-ab');
DO $$ BEGIN
 IF (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000a')<>0
 OR (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000b')<>0
 OR (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000c')<>1000
 OR (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='10000000-0000-0000-0000-000000000002')<>5
 OR (SELECT count(*) FROM site_claimant_reassignments WHERE site_entry_id='10000000-0000-0000-0000-000000000002')<>2
 OR (SELECT count(DISTINCT original_earning_transaction_id) FROM site_claimant_reassignments
     WHERE site_entry_id='10000000-0000-0000-0000-000000000002')<>1
 OR EXISTS (
    SELECT 1 FROM wallet_transactions t
    WHERE t.site_visit_id='10000000-0000-0000-0000-000000000002'
      AND t.type IN ('adjustment_debit','adjustment_credit')
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions peer
        WHERE peer.id=(t.metadata->>'compensating_transaction_id')::uuid
          AND peer.metadata->>'compensating_transaction_id'=t.id::text))
 OR (SELECT effective_claimant_id FROM site_effective_claimants WHERE site_entry_id='10000000-0000-0000-0000-000000000002')
    <>'00000000-0000-0000-0000-00000000000c'
 THEN RAISE EXCEPTION 'paid chain did not reconcile'; END IF;
END $$;

-- A transfer may create recoverable debt without changing the conserved total.
INSERT INTO wallet_transactions(wallet_id,user_id,amount_cents,type,status,site_visit_id,amount)
SELECT id,user_id,700,'earning','posted','10000000-0000-0000-0000-000000000003',7
FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000a';
UPDATE wallets SET balance_cents=100, balances='{"SDG":1}' WHERE user_id='00000000-0000-0000-0000-00000000000a';
SELECT reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-00000000000b','Recoverable debt transfer','debt-ab');
DO $$ BEGIN
 IF (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000a')<>-600
 OR (SELECT balance_cents FROM wallets WHERE user_id='00000000-0000-0000-0000-00000000000b')<>700
 THEN RAISE EXCEPTION 'recoverable debt transfer failed'; END IF;
END $$;

-- Advance-offset and cash-settled cases are fail-closed.
INSERT INTO site_advance_applications(mmp_site_entry_id,applied_cents)
VALUES ('10000000-0000-0000-0000-000000000004',100);
UPDATE mmp_site_entries SET fee_paid_status='paid',fee_cash_paid_amount=5
 WHERE id='10000000-0000-0000-0000-000000000005';
DO $$ BEGIN
 BEGIN
  PERFORM reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-00000000000b','Blocked advance transfer','blocked-advance');
  RAISE EXCEPTION 'advance transfer was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='advance transfer was accepted' OR SQLERRM NOT LIKE '%advance offset%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM reassign_site_claimant_rpc('10000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-00000000000b','Blocked cash transfer','blocked-cash');
  RAISE EXCEPTION 'cash transfer was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='cash transfer was accepted' OR SQLERRM NOT LIKE '%non-wallet settlement%' THEN RAISE; END IF;
 END;
END $$;

-- Audit evidence is immutable.
DO $$ BEGIN
 BEGIN
  UPDATE site_claimant_reassignments SET reason='tampered';
  RAISE EXCEPTION 'audit update was accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='audit update was accepted' OR SQLERRM NOT LIKE '%append-only%' THEN RAISE; END IF;
 END;
END $$;

\echo 'Claimant reassignment sequential checks passed.'