-- Production-like coordinator/supervisor settlement fixtures.
BEGIN;

INSERT INTO profiles(id,role,hub_id,state_id) VALUES
 ('00000000-0000-0000-0000-000000000001','Financial Admin',NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','Coordinator','10000000-0000-0000-0000-000000000001','north'),
 ('00000000-0000-0000-0000-000000000003','Supervisor','10000000-0000-0000-0000-000000000001',NULL),
 ('00000000-0000-0000-0000-000000000004','Officer','10000000-0000-0000-0000-000000000001',NULL),
 ('00000000-0000-0000-0000-000000000005','Officer','10000000-0000-0000-0000-000000000001',NULL),
 ('00000000-0000-0000-0000-000000000006','Admin',NULL,NULL);
UPDATE profiles SET additional_roles='[{"role":"FOM","hub_id":"10000000-0000-0000-0000-000000000001"}]'
 WHERE id='00000000-0000-0000-0000-000000000004';
INSERT INTO hubs VALUES('10000000-0000-0000-0000-000000000001','Test Hub');
INSERT INTO hub_states VALUES
 ('10000000-0000-0000-0000-000000000001','north','Northern State'),
 ('10000000-0000-0000-0000-000000000001','south','Southern State');
INSERT INTO mmp_files(id,name,hub_id,currency,uploaded_at)
 VALUES('20000000-0000-0000-0000-000000000001','September MMP','10000000-0000-0000-0000-000000000001','SDG','2026-09-01');
INSERT INTO mmp_site_entries(mmp_file_id,state,enumerator_fee,verified_by) VALUES
 ('20000000-0000-0000-0000-000000000001','north',100.01,'00000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000001','Northern State',50.02,'00000000-0000-0000-0000-000000000001');
INSERT INTO incentive_configs(hub_id,role,is_active,bonus_pct,split_method,coverage_threshold_pct,what_counts) VALUES
 (NULL,'coordinator',true,10,'proportional',100,'wfp_confirmed'),
 (NULL,'supervisor',true,5,'equal',100,'wfp_confirmed'),
 (NULL,'fom',true,3,'equal',100,'wfp_confirmed'),
 (NULL,'support_team',true,2,'equal',100,'wfp_confirmed');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
-- A name matching two canonical IDs must fail before a snapshot/payment is made.
INSERT INTO hub_states VALUES('10000000-0000-0000-0000-000000000001','north-duplicate','Northern-State');
INSERT INTO mmp_files(id,name,hub_id,currency,uploaded_at)
 VALUES('20000000-0000-0000-0000-000000000099','Ambiguous State MMP','10000000-0000-0000-0000-000000000001','SDG','2026-09-01');
INSERT INTO mmp_site_entries(mmp_file_id,state,enumerator_fee,verified_by)
 VALUES('20000000-0000-0000-0000-000000000099','Northern State',10,'00000000-0000-0000-0000-000000000001');
DO $$
BEGIN
 BEGIN
  PERFORM calculate_and_preapprove_mmp_incentives(
   '20000000-0000-0000-0000-000000000099',
   '[{"user_id":"00000000-0000-0000-0000-000000000005","role":"support_team","action":"include","note":"fixture"}]');
  RAISE EXCEPTION 'ambiguous normalized state unexpectedly calculated';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'ambiguous state %' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE mmp_id='20000000-0000-0000-0000-000000000099')
    OR EXISTS(SELECT 1 FROM mmp_incentive_snapshots WHERE mmp_id='20000000-0000-0000-0000-000000000099')
 THEN RAISE EXCEPTION 'ambiguous state failure left incentive rows behind'; END IF;
END $$;
DELETE FROM hub_states WHERE state_id='north-duplicate';

-- Exercise the audited revocation RPC through its authenticated grant.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SELECT set_mmp_incentive_eligibility_override(
 '00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',
 'support_team','include','temporary fixture',NULL);
SELECT revoke_mmp_incentive_eligibility_override(
 (SELECT id FROM mmp_incentive_eligibility_overrides WHERE user_id='00000000-0000-0000-0000-000000000005' AND revoked_at IS NULL),
 'fixture revocation');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mmp_incentive_eligibility_overrides
   WHERE user_id='00000000-0000-0000-0000-000000000005'
    AND revoked_at IS NOT NULL AND revoked_by='00000000-0000-0000-0000-000000000006'
    AND revoke_note='fixture revocation') THEN RAISE EXCEPTION 'override revocation evidence missing'; END IF;
END $$;
-- This user is the payable Supervisor.  Their valid Coordinator exception is
-- for a state absent from this MMP and must not create false role ambiguity.
SELECT set_mmp_incentive_eligibility_override(
 '00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
 'coordinator','include','other-state coordinator fixture','south');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT calculate_and_preapprove_mmp_incentives(
 '20000000-0000-0000-0000-000000000001',
 '[{"user_id":"00000000-0000-0000-0000-000000000005","role":"support_team","action":"include","note":"fixture support selection"}]');
DO $$
DECLARE snap uuid; counts jsonb;
BEGIN
 SELECT id,role_counts INTO snap,counts FROM mmp_incentive_snapshots
  WHERE mmp_id='20000000-0000-0000-0000-000000000001';
 IF (SELECT count(*) FROM mmp_incentive_payments WHERE snapshot_id=snap)<>4
    OR (SELECT sum(bonus_amount_cents) FROM mmp_incentive_payments WHERE snapshot_id=snap)<>3000
    OR counts<> '{"coordinator":1,"supervisor":1,"fom":1,"support_team":1}'::jsonb
    OR NOT EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE snapshot_id=snap AND role='fom'
      AND eligibility_evidence->>'source'='additional_role_object')
    OR NOT EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE snapshot_id=snap AND role='support_team'
      AND eligibility_evidence->>'source'='explicit_selection')
    OR NOT EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE snapshot_id=snap AND role='supervisor'
      AND user_id='00000000-0000-0000-0000-000000000003')
    OR EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE snapshot_id=snap
      AND user_id='00000000-0000-0000-0000-000000000003' AND role='coordinator')
 THEN RAISE EXCEPTION 'four-role payment/evidence/count reconciliation failed: %',
   (SELECT jsonb_agg(to_jsonb(p)) FROM mmp_incentive_payments p WHERE snapshot_id=snap);
 END IF;
 UPDATE profiles SET additional_roles='["supervisor"]'::jsonb
  WHERE id='00000000-0000-0000-0000-000000000002';
 BEGIN
  PERFORM calculate_and_preapprove_mmp_incentives(
   '20000000-0000-0000-0000-000000000001',
   '[{"user_id":"00000000-0000-0000-0000-000000000005","role":"support_team","action":"include","note":"fixture support selection"}]');
  RAISE EXCEPTION 'cross-role ambiguity unexpectedly calculated';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'ambiguous incentive roles for user(s): %' THEN RAISE; END IF;
 END;
 UPDATE profiles SET additional_roles='[]'::jsonb
  WHERE id='00000000-0000-0000-0000-000000000002';
 IF (SELECT count(*) FROM mmp_incentive_payments WHERE snapshot_id=snap)<>4
 THEN RAISE EXCEPTION 'ambiguity failure altered existing payments'; END IF;
END $$;
UPDATE mmp_incentive_snapshots SET status='approved'
 WHERE mmp_id='20000000-0000-0000-0000-000000000001';

DO $$
DECLARE c uuid; s uuid; snap uuid; total bigint; first_ref text; retry_ref text;
BEGIN
 SELECT id INTO c FROM mmp_incentive_payments
  WHERE role='coordinator' AND mmp_id='20000000-0000-0000-0000-000000000001';
 SELECT id INTO s FROM mmp_incentive_payments
  WHERE role='supervisor' AND mmp_id='20000000-0000-0000-0000-000000000001';
 SELECT id,total_bonus_cents INTO snap,total FROM mmp_incentive_snapshots
  WHERE mmp_id='20000000-0000-0000-0000-000000000001';
 IF total<>(SELECT sum(bonus_amount_cents) FROM mmp_incentive_payments WHERE snapshot_id=snap)
     OR total<>3000 THEN RAISE EXCEPTION 'snapshot total does not reconcile exactly: %',total; END IF;

 SELECT pay_mmp_incentive(c,'wallet',NULL,NULL)->>'reference' INTO first_ref;
 SELECT pay_mmp_incentive(c,'wallet',NULL,NULL)->>'reference' INTO retry_ref;
 IF first_ref<>retry_ref OR (SELECT count(*) FROM wallet_transactions
   WHERE metadata->>'incentive_payment_id'=c::text)<>1 THEN
   RAISE EXCEPTION 'wallet retry was not idempotent';
 END IF;

 PERFORM pay_mmp_incentive(s,'payroll',NULL,'2026-09');
 PERFORM pay_mmp_incentive(s,'payroll',NULL,'2026-09');
 IF (SELECT count(*) FROM payroll_run_items WHERE reference_id=s)<>1 THEN
   RAISE EXCEPTION 'payroll retry was not idempotent';
 END IF;

 BEGIN
   UPDATE mmp_incentive_settlements SET payroll_item_id=NULL WHERE payment_id=s;
   RAISE EXCEPTION 'paid settlement evidence was allowed to diverge';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settlement evidence cannot diverge%'
      AND SQLERRM NOT LIKE 'settlement evidence identity is immutable%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE payroll_run_items SET amount_cents=1 WHERE reference_id=s;
   RAISE EXCEPTION 'payroll source evidence was mutable after settlement';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'source evidence for a settled incentive%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_settlements SET payment_id=c WHERE payment_id=s;
   RAISE EXCEPTION 'paid settlement was reassigned to another payment';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settlement payment identity is immutable%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_settlements
     SET reversed_at=now(),reversal_reference='forged-before-reversal',
         reversal_reason='forged'
     WHERE payment_id=s;
   SET CONSTRAINTS mmp_incentive_settlement_final_consistency IMMEDIATE;
   RAISE EXCEPTION 'paid settlement accepted reversal evidence';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'paid incentive cannot contain reversal evidence%' THEN RAISE; END IF;
 END;

  IF coalesce((SELECT (w.balances->>p.currency)::numeric
      FROM wallets w JOIN mmp_incentive_payments p ON p.user_id=w.user_id
      WHERE p.id=c),0)
     < (SELECT bonus_amount_cents::numeric/100 FROM mmp_incentive_payments WHERE id=c) THEN
    RAISE EXCEPTION 'wallet credit did not reach the recipient balance before reversal: %',
      (SELECT jsonb_build_object('balances',w.balances,'currency',p.currency,
        'amount_cents',p.bonus_amount_cents)
       FROM wallets w JOIN mmp_incentive_payments p ON p.user_id=w.user_id
       WHERE p.id=c);
  END IF;
  PERFORM reverse_mmp_incentive(c,'Fixture partial reversal');
 PERFORM reverse_mmp_incentive(c,'Fixture partial reversal');
 IF (SELECT count(*) FROM wallet_transactions WHERE metadata->>'incentive_payment_id'=c::text)<>2
    OR NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE metadata->>'incentive_payment_id'=c::text AND amount_cents>0)
    OR NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE metadata->>'incentive_payment_id'=c::text AND amount_cents<0)
    OR (SELECT status FROM mmp_incentive_snapshots WHERE id=snap)<>'paid' THEN
   RAISE EXCEPTION 'partial wallet reversal lost evidence or corrupted snapshot status';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mmp_incentive_settlements e
   JOIN wallet_transactions t ON t.id=e.reversal_wallet_transaction_id
   WHERE e.payment_id=c AND t.amount_cents=-(SELECT bonus_amount_cents FROM mmp_incentive_payments WHERE id=c))
 THEN RAISE EXCEPTION 'wallet reversal transaction is not retained as immutable evidence'; END IF;
 BEGIN
   UPDATE mmp_incentive_payments SET reversed_at=now()+interval '1 second' WHERE id=c;
   RAISE EXCEPTION 'reversed payment timestamp was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET reversed_by=s WHERE id=c;
   RAISE EXCEPTION 'reversed payment actor was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET reversal_reason='forged reason' WHERE id=c;
   RAISE EXCEPTION 'reversed payment reason was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET reversal_reference='forged reference' WHERE id=c;
   RAISE EXCEPTION 'reversed payment reference was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;

 BEGIN
   PERFORM reverse_mmp_incentive(s,'Must use payroll process');
   RAISE EXCEPTION 'payroll reversal unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'payroll incentive cannot be reversed here%' THEN RAISE; END IF;
 END;

 BEGIN
   UPDATE mmp_incentive_payments SET payment_method='wallet' WHERE id=s;
   RAISE EXCEPTION 'paid payment status was allowed to diverge';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'incentive payment status requires matching%'
      AND SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET status='pending' WHERE id=s;
   RAISE EXCEPTION 'paid payment was allowed to return to pending';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET bonus_amount_cents=bonus_amount_cents+1 WHERE id=s;
   RAISE EXCEPTION 'paid payment amount was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO mmp_files(id,name,hub_id,currency,uploaded_at)
    VALUES('20000000-0000-0000-0000-000000000002','Other MMP',
      '10000000-0000-0000-0000-000000000001','SDG','2026-09-01');
   UPDATE mmp_incentive_payments
    SET mmp_id='20000000-0000-0000-0000-000000000002' WHERE id=s;
   RAISE EXCEPTION 'paid payment MMP scope was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO mmp_files(id,name,hub_id,currency,uploaded_at)
    VALUES('20000000-0000-0000-0000-000000000003','Other Snapshot MMP',
      '10000000-0000-0000-0000-000000000001','SDG','2026-09-01');
   INSERT INTO mmp_incentive_snapshots(id,mmp_id,status)
    VALUES('30000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000003','approved');
   UPDATE mmp_incentive_payments
    SET snapshot_id='30000000-0000-0000-0000-000000000003' WHERE id=s;
   RAISE EXCEPTION 'paid payment snapshot scope was mutable';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE mmp_incentive_payments SET status='paid' WHERE id=c;
   RAISE EXCEPTION 'reversed payment was allowed to return to paid';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'settled incentive payment identity and lifecycle%' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO mmp_incentive_payments(
     id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,payment_method,payment_reference
   ) VALUES(
     '30000000-0000-0000-0000-000000000001',snap,
     '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
     'fixture-forgery',100,'SDG','pending','wallet','forged'
   );
   INSERT INTO wallet_transactions(
     id,user_id,type,status,amount,amount_cents,currency,metadata
   ) VALUES(
     '30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',
     'adjustment','pending',1,100,'SDG',
     '{"incentive_payment_id":"30000000-0000-0000-0000-000000000001"}'
   );
   INSERT INTO mmp_incentive_settlements(payment_id,method,payment_reference,wallet_transaction_id)
   VALUES('30000000-0000-0000-0000-000000000001','wallet','forged',
     '30000000-0000-0000-0000-000000000002');
   UPDATE mmp_incentive_payments SET status='paid'
    WHERE id='30000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'unposted wallet evidence was accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'wallet settlement evidence does not match%' THEN RAISE; END IF;
 END;

 IF EXISTS(
   SELECT 1 FROM mmp_incentive_payments p
   LEFT JOIN mmp_incentive_settlements e ON e.payment_id=p.id
   WHERE (p.status='paid' AND (e.payment_id IS NULL OR
      (e.method='wallet' AND e.wallet_transaction_id IS NULL) OR
      (e.method='payroll' AND e.payroll_item_id IS NULL)))
      OR (p.status='reversed' AND (e.method<>'wallet' OR e.reversed_at IS NULL))
 ) THEN RAISE EXCEPTION 'payment status diverged from settlement evidence'; END IF;
END $$;

SET ROLE authenticated;
DO $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
   INSERT INTO mmp_incentive_payments(
     snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status
   ) VALUES(
     '00000000-0000-0000-0000-000000000000',
     '20000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000002','forged',100,'SDG','pending'
   );
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'authenticated role could directly create incentive payments'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO mmp_incentive_settlements(payment_id,method,payment_reference)
   VALUES('00000000-0000-0000-0000-000000000000','wallet','forged');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'authenticated role could directly create settlements'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO wallet_transactions(
     user_id,type,status,amount,amount_cents,currency,metadata
   ) VALUES(
     '00000000-0000-0000-0000-000000000002','adjustment','posted',1,100,'SDG',
     '{"incentive_payment_id":"30000000-0000-0000-0000-000000000001"}'
   );
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'authenticated role could forge wallet incentive evidence'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO payroll_run_items(user_id,type,amount_cents,currency,period_label,reference_id)
   VALUES('00000000-0000-0000-0000-000000000002','incentive_bonus',100,'SDG','forged',
     '30000000-0000-0000-0000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'authenticated role could forge payroll incentive evidence'; END IF;
END $$;
RESET ROLE;

ROLLBACK;