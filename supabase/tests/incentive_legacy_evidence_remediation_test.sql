BEGIN;

INSERT INTO profiles(id,role) VALUES
 ('90000000-0000-0000-0000-000000000001','Financial Admin'),
 ('90000000-0000-0000-0000-000000000002','Coordinator');
INSERT INTO hubs(id,name) VALUES('90000000-0000-0000-0000-000000000010','Legacy Hub');
INSERT INTO mmp_files(id,name,hub_id) VALUES(
 '90000000-0000-0000-0000-000000000020','Legacy MMP',
 '90000000-0000-0000-0000-000000000010');
INSERT INTO mmp_incentive_snapshots(id,mmp_id,status) VALUES(
 '90000000-0000-0000-0000-000000000030',
 '90000000-0000-0000-0000-000000000020','paid');
INSERT INTO mmp_incentive_payments(
 id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,
 payment_method,paid_at,idempotency_key
) VALUES
 ('90000000-0000-0000-0000-000000000041','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'coordinator',1250,'SDG','paid','wallet',now(),'90000000-0000-0000-0000-000000000051'),
 ('90000000-0000-0000-0000-000000000042','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'supervisor',800,'SDG','paid','payroll',now(),'90000000-0000-0000-0000-000000000052'),
 ('90000000-0000-0000-0000-000000000044','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'legacy-reversed',300,'SDG','reversed','wallet',now(),'90000000-0000-0000-0000-000000000054');
UPDATE mmp_incentive_payments SET reversed_at=now(),reversal_reason='Legacy correction',
 reversal_reference='legacy-reversal-44'
 WHERE id='90000000-0000-0000-0000-000000000044';
INSERT INTO wallets(id,user_id) VALUES(
 '90000000-0000-0000-0000-000000000060','90000000-0000-0000-0000-000000000002');
INSERT INTO wallet_transactions(
 id,wallet_id,user_id,type,status,amount,amount_cents,currency,metadata
) VALUES(
 '90000000-0000-0000-0000-000000000061','90000000-0000-0000-0000-000000000060',
 '90000000-0000-0000-0000-000000000002','adjustment','posted',12.5,1250,'SDG',
 '{"idempotency_key":"90000000-0000-0000-0000-000000000051"}');
INSERT INTO wallet_transactions(
 id,wallet_id,user_id,type,status,amount,amount_cents,currency,metadata
) VALUES
 ('90000000-0000-0000-0000-000000000063','90000000-0000-0000-0000-000000000060',
  '90000000-0000-0000-0000-000000000002','adjustment','posted',3,300,'SDG',
  '{"idempotency_key":"90000000-0000-0000-0000-000000000054"}'),
 ('90000000-0000-0000-0000-000000000064','90000000-0000-0000-0000-000000000060',
  '90000000-0000-0000-0000-000000000002','adjustment','posted',-3,-300,'SDG',
  '{"incentive_payment_id":"90000000-0000-0000-0000-000000000044","reversal_reference":"legacy-reversal-44"}');
INSERT INTO payroll_run_items(
 id,user_id,type,amount_cents,currency,period_label,reference_id
) VALUES(
 '90000000-0000-0000-0000-000000000062','90000000-0000-0000-0000-000000000002',
 'incentive_bonus',800,'SDG','legacy',
 '90000000-0000-0000-0000-000000000042');

SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);

DO $$
BEGIN
 IF (SELECT count(*) FROM get_legacy_incentive_evidence_report()
     WHERE issue_code='ready_for_deterministic_backfill')<>3 THEN
   RAISE EXCEPTION 'report did not identify all deterministic legacy matches';
 END IF;
 PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000041');
 PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000042');
 PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000044');
 IF EXISTS(SELECT 1 FROM get_legacy_incentive_evidence_report()) THEN
   RAISE EXCEPTION 'reconciled legacy rows remain in the exception report';
 END IF;
 IF (SELECT count(*) FROM mmp_incentive_evidence_backfill_audit)<>3
    OR NOT EXISTS(SELECT 1 FROM wallet_transactions
      WHERE id='90000000-0000-0000-0000-000000000061'
        AND metadata->>'incentive_payment_id'='90000000-0000-0000-0000-000000000041') THEN
   RAISE EXCEPTION 'audited evidence links were not retained';
 END IF;
END $$;

COMMIT;

-- A duplicate trusted wallet candidate is reported and cannot be auto-linked.
BEGIN;
SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
INSERT INTO mmp_incentive_payments(
 id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,
 payment_method,paid_at,idempotency_key
) VALUES(
 '90000000-0000-0000-0000-000000000043','90000000-0000-0000-0000-000000000030',
 '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
 'ambiguous',500,'SDG','paid','wallet',now(),'90000000-0000-0000-0000-000000000053');
INSERT INTO wallet_transactions(
 wallet_id,user_id,type,status,amount,amount_cents,currency,metadata
) VALUES
 ('90000000-0000-0000-0000-000000000060','90000000-0000-0000-0000-000000000002',
  'adjustment','posted',5,500,'SDG','{"idempotency_key":"90000000-0000-0000-0000-000000000053"}'),
 ('90000000-0000-0000-0000-000000000060','90000000-0000-0000-0000-000000000002',
  'adjustment','posted',5,500,'SDG','{"idempotency_key":"90000000-0000-0000-0000-000000000053"}');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM get_legacy_incentive_evidence_report()
   WHERE payment_id='90000000-0000-0000-0000-000000000043'
     AND issue_code='ambiguous_source' AND eligible_source_count=2) THEN
   RAISE EXCEPTION 'ambiguous evidence was not reported';
 END IF;
 BEGIN
   PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000043');
   RAISE EXCEPTION 'ambiguous evidence was linked';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'deterministic backfill requires exactly one%' THEN RAISE; END IF;
 END;
END $$;

-- A matching transaction already owned by another settlement is contradictory,
-- not an eligible idempotency-key candidate.
INSERT INTO mmp_incentive_payments(
 id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,
 payment_method,paid_at,idempotency_key
) VALUES
 ('90000000-0000-0000-0000-000000000045','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'conflicting-owner',650,'SDG','pending','wallet',NULL,'90000000-0000-0000-0000-000000000055'),
 ('90000000-0000-0000-0000-000000000046','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'conflicting-target',650,'SDG','paid','wallet',now(),'90000000-0000-0000-0000-000000000055');
INSERT INTO wallet_transactions(
 id,wallet_id,user_id,type,status,amount,amount_cents,currency,metadata
) VALUES(
 '90000000-0000-0000-0000-000000000065','90000000-0000-0000-0000-000000000060',
 '90000000-0000-0000-0000-000000000002','adjustment','posted',6.5,650,'SDG',
 '{"idempotency_key":"90000000-0000-0000-0000-000000000055"}');
INSERT INTO mmp_incentive_settlements(
 payment_id,method,payment_reference,wallet_transaction_id
) VALUES(
 '90000000-0000-0000-0000-000000000045','wallet','existing-owner-reference',
 '90000000-0000-0000-0000-000000000065');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM get_legacy_incentive_evidence_report()
   WHERE payment_id='90000000-0000-0000-0000-000000000046'
     AND issue_code='no_trustworthy_source' AND eligible_source_count=0) THEN
   RAISE EXCEPTION 'source owned by another settlement was offered for backfill';
 END IF;
 BEGIN
   PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000046');
   RAISE EXCEPTION 'source owned by another settlement was reassigned';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'deterministic backfill requires exactly one trustworthy source; found 0%' THEN RAISE; END IF;
 END;
END $$;

-- A matching payroll item already owned by another settlement is also excluded
-- consistently by the report and the backfill.
INSERT INTO mmp_incentive_payments(
 id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,
 payment_method,paid_at,idempotency_key
) VALUES
 ('90000000-0000-0000-0000-000000000047','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'payroll-owner',900,'SDG','pending','payroll',NULL,'90000000-0000-0000-0000-000000000057'),
 ('90000000-0000-0000-0000-000000000048','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'payroll-target',900,'SDG','paid','payroll',now(),'90000000-0000-0000-0000-000000000058');
INSERT INTO payroll_run_items(
 id,user_id,type,amount_cents,currency,period_label,reference_id
) VALUES(
 '90000000-0000-0000-0000-000000000066','90000000-0000-0000-0000-000000000002',
 'incentive_bonus',900,'SDG','legacy-conflict',
 '90000000-0000-0000-0000-000000000048');
INSERT INTO mmp_incentive_settlements(
 payment_id,method,payment_reference,payroll_item_id
) VALUES(
 '90000000-0000-0000-0000-000000000047','payroll','existing-payroll-owner-reference',
 '90000000-0000-0000-0000-000000000066');
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM get_legacy_incentive_evidence_report()
   WHERE payment_id='90000000-0000-0000-0000-000000000048'
     AND issue_code='no_trustworthy_source' AND eligible_source_count=0) THEN
   RAISE EXCEPTION 'payroll source owned by another settlement was offered for backfill';
 END IF;
 BEGIN
   PERFORM backfill_legacy_incentive_evidence('90000000-0000-0000-0000-000000000048');
   RAISE EXCEPTION 'payroll source owned by another settlement was reassigned';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'deterministic backfill requires exactly one trustworthy source; found 0%' THEN RAISE; END IF;
 END;
END $$;

ROLLBACK;