-- One-time backfill: insert DELTA wallet adjustment transactions for visits
-- that were historically underpaid before add-on multipliers (MDM/WHM/PDM)
-- were applied.
--
-- Safety properties:
--  - Idempotent via mmp_site_entries.additional_data.wallet_adjustment_backfilled
--  - Inserts only positive deltas
--  - Uses runtime column checks so it works across wallet schema variants

BEGIN;

DO $$
DECLARE
  has_user_id BOOLEAN;
  has_amount BOOLEAN;
  has_amount_cents BOOLEAN;
  has_currency BOOLEAN;
  has_type BOOLEAN;
  has_status BOOLEAN;
  has_description BOOLEAN;
  has_reference_id BOOLEAN;
  has_site_visit_id BOOLEAN;
  has_transaction_date BOOLEAN;
  has_posted_at BOOLEAN;
  has_created_at BOOLEAN;
  has_wallet_id BOOLEAN;
  has_wallets_table BOOLEAN;
  wallet_id_not_null BOOLEAN;
  use_wallet_join BOOLEAN;
  tx_type_udt TEXT;
  tx_status_udt TEXT;
  tx_type_value TEXT := 'visit_completion';
  tx_status_value TEXT := 'completed';

  insert_columns TEXT := '';
  select_columns TEXT := '';
  dedupe_clause TEXT := '';
  wallet_requirement_clause TEXT := '';
  wallet_join_sql TEXT := '';
  sql_insert TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'user_id'
  ) INTO has_user_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'amount'
  ) INTO has_amount;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'amount_cents'
  ) INTO has_amount_cents;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'currency'
  ) INTO has_currency;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'type'
  ) INTO has_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'status'
  ) INTO has_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'description'
  ) INTO has_description;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'reference_id'
  ) INTO has_reference_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'site_visit_id'
  ) INTO has_site_visit_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'transaction_date'
  ) INTO has_transaction_date;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'posted_at'
  ) INTO has_posted_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'created_at'
  ) INTO has_created_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'wallet_id'
  ) INTO has_wallet_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wallets'
  ) INTO has_wallets_table;

  IF NOT has_user_id THEN
    RAISE EXCEPTION 'wallet_transactions.user_id is required';
  END IF;

  IF NOT has_amount AND NOT has_amount_cents THEN
    RAISE EXCEPTION 'wallet_transactions must have amount or amount_cents';
  END IF;

  IF has_wallet_id THEN
    SELECT (c.is_nullable = 'NO')
    INTO wallet_id_not_null
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'wallet_transactions'
      AND c.column_name = 'wallet_id'
    LIMIT 1;
  ELSE
    wallet_id_not_null := FALSE;
  END IF;

  IF has_wallet_id AND has_wallets_table THEN
    wallet_join_sql := 'LEFT JOIN public.wallets w ON w.user_id = m.visit_completed_by';
  END IF;

  use_wallet_join := has_wallet_id AND has_wallets_table;

  IF has_wallet_id AND wallet_id_not_null AND NOT has_wallets_table THEN
    RAISE EXCEPTION 'wallet_transactions.wallet_id is NOT NULL but wallets table is missing';
  END IF;

  IF use_wallet_join AND wallet_id_not_null THEN
    wallet_requirement_clause := ' AND c.wallet_id IS NOT NULL';
  END IF;

  IF has_reference_id THEN
    dedupe_clause :=
      ' AND NOT EXISTS (' ||
      '   SELECT 1 FROM public.wallet_transactions wt' ||
      '   WHERE wt.reference_id = (''addon_fee_backfill:'' || c.site_id)' ||
      ' )';
  END IF;

  IF has_type THEN
    SELECT c.udt_name
    INTO tx_type_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'wallet_transactions'
      AND c.column_name = 'type'
    LIMIT 1;

    IF tx_type_udt IS NOT NULL THEN
      SELECT e.enumlabel
      INTO tx_type_value
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = tx_type_udt
        AND e.enumlabel IN ('visit_completion', 'site_visit_fee', 'earning')
      ORDER BY CASE e.enumlabel
        WHEN 'visit_completion' THEN 1
        WHEN 'site_visit_fee' THEN 2
        WHEN 'earning' THEN 3
        ELSE 99
      END
      LIMIT 1;

      IF tx_type_value IS NULL THEN
        SELECT e.enumlabel
        INTO tx_type_value
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = tx_type_udt
        ORDER BY e.enumsortorder
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF has_status THEN
    SELECT c.udt_name
    INTO tx_status_udt
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'wallet_transactions'
      AND c.column_name = 'status'
    LIMIT 1;

    IF tx_status_udt IS NOT NULL THEN
      SELECT e.enumlabel
      INTO tx_status_value
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = tx_status_udt
        AND e.enumlabel IN ('completed', 'posted', 'pending')
      ORDER BY CASE e.enumlabel
        WHEN 'completed' THEN 1
        WHEN 'posted' THEN 2
        WHEN 'pending' THEN 3
        ELSE 99
      END
      LIMIT 1;

      IF tx_status_value IS NULL THEN
        SELECT e.enumlabel
        INTO tx_status_value
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = tx_status_udt
        ORDER BY e.enumsortorder
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF use_wallet_join THEN
    insert_columns := insert_columns || 'wallet_id,';
    select_columns := select_columns || 'c.wallet_id::uuid,';
  END IF;

  insert_columns := insert_columns || 'user_id,';
  select_columns := select_columns || 'c.user_id::uuid,';

  IF has_amount THEN
    insert_columns := insert_columns || 'amount,';
    select_columns := select_columns || 'c.delta_amount,';
  END IF;

  IF has_amount_cents THEN
    insert_columns := insert_columns || 'amount_cents,';
    select_columns := select_columns || 'ROUND(c.delta_amount * 100)::bigint,';
  END IF;

  IF has_currency THEN
    insert_columns := insert_columns || 'currency,';
    select_columns := select_columns || '''SDG'',';
  END IF;

  IF has_type THEN
    insert_columns := insert_columns || 'type,';
    select_columns := select_columns || quote_literal(tx_type_value) || ',';
  END IF;

  IF has_status THEN
    insert_columns := insert_columns || 'status,';
    select_columns := select_columns || quote_literal(tx_status_value) || ',';
  END IF;

  IF has_reference_id THEN
    insert_columns := insert_columns || 'reference_id,';
    select_columns := select_columns || '(''addon_fee_backfill:'' || c.site_id),';
  END IF;

  IF has_description THEN
    insert_columns := insert_columns || 'description,';
    select_columns := select_columns ||
      '(''Backfill add-on fee delta (x'' || c.fee_multiplier || ''): +'' || c.delta_amount || '' SDG''),';
  END IF;

  IF has_created_at THEN
    insert_columns := insert_columns || 'created_at,';
    select_columns := select_columns || 'NOW(),';
  END IF;

  IF has_posted_at THEN
    insert_columns := insert_columns || 'posted_at,';
    select_columns := select_columns || 'NOW(),';
  END IF;

  IF has_transaction_date THEN
    insert_columns := insert_columns || 'transaction_date,';
    select_columns := select_columns || 'NOW(),';
  END IF;

  IF has_site_visit_id THEN
    insert_columns := insert_columns || 'site_visit_id,';
    select_columns := select_columns || 'c.site_id::uuid,';
  END IF;

  insert_columns := left(insert_columns, length(insert_columns) - 1);
  select_columns := left(select_columns, length(select_columns) - 1);

  sql_insert := format(
    $fmt$
      WITH candidates AS (
        SELECT
          m.id::text AS site_id,
          m.visit_completed_by::text AS user_id,
          %s
          CASE
            WHEN (m.additional_data ->> 'adjusted_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
             AND (m.additional_data ->> 'base_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
            THEN
              ((m.additional_data ->> 'adjusted_enumerator_fee')::numeric -
               (m.additional_data ->> 'base_enumerator_fee')::numeric)
            ELSE 0::numeric
          END AS delta_amount,
          COALESCE((m.additional_data ->> 'fee_multiplier')::int, 1) AS fee_multiplier
        FROM public.mmp_site_entries m
        %s
        WHERE m.visit_completed_by IS NOT NULL
          AND COALESCE((m.additional_data ->> 'fee_adjusted_for_addon_activities')::boolean, false) = true
          AND COALESCE((m.additional_data ->> 'wallet_adjustment_backfilled')::boolean, false) = false
      ),
      filtered AS (
        SELECT *
        FROM candidates c
        WHERE c.delta_amount > 0
          %s
          %s
      )
      INSERT INTO public.wallet_transactions (%s)
      SELECT %s
      FROM filtered c;
    $fmt$,
    CASE WHEN use_wallet_join THEN 'COALESCE(w.id::text, NULL) AS wallet_id,' ELSE '' END,
    wallet_join_sql,
    wallet_requirement_clause,
    dedupe_clause,
    insert_columns,
    select_columns
  );

  EXECUTE sql_insert;

  IF has_wallet_id AND wallet_id_not_null AND has_wallets_table THEN
    UPDATE public.mmp_site_entries m
    SET
      additional_data = COALESCE(m.additional_data, '{}'::jsonb) || jsonb_build_object(
        'wallet_adjustment_backfilled', TRUE,
        'wallet_adjustment_backfilled_at', NOW()::TEXT,
        'wallet_adjustment_backfill_source', '20260304_backfill_addon_wallet_adjustments'
      ),
      updated_at = NOW()
    WHERE m.visit_completed_by IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.wallets w WHERE w.user_id = m.visit_completed_by
      )
      AND COALESCE((m.additional_data ->> 'fee_adjusted_for_addon_activities')::boolean, false) = true
      AND COALESCE((m.additional_data ->> 'wallet_adjustment_backfilled')::boolean, false) = false
      AND (
        CASE
          WHEN (m.additional_data ->> 'adjusted_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
           AND (m.additional_data ->> 'base_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
          THEN
            ((m.additional_data ->> 'adjusted_enumerator_fee')::numeric -
             (m.additional_data ->> 'base_enumerator_fee')::numeric)
          ELSE 0::numeric
        END
      ) > 0;
  ELSE
    UPDATE public.mmp_site_entries m
    SET
      additional_data = COALESCE(m.additional_data, '{}'::jsonb) || jsonb_build_object(
        'wallet_adjustment_backfilled', TRUE,
        'wallet_adjustment_backfilled_at', NOW()::TEXT,
        'wallet_adjustment_backfill_source', '20260304_backfill_addon_wallet_adjustments'
      ),
      updated_at = NOW()
    WHERE m.visit_completed_by IS NOT NULL
      AND COALESCE((m.additional_data ->> 'fee_adjusted_for_addon_activities')::boolean, false) = true
      AND COALESCE((m.additional_data ->> 'wallet_adjustment_backfilled')::boolean, false) = false
      AND (
        CASE
          WHEN (m.additional_data ->> 'adjusted_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
           AND (m.additional_data ->> 'base_enumerator_fee') ~ '^-?\d+(\.\d+)?$'
          THEN
            ((m.additional_data ->> 'adjusted_enumerator_fee')::numeric -
             (m.additional_data ->> 'base_enumerator_fee')::numeric)
          ELSE 0::numeric
        END
      ) > 0;
  END IF;
END $$
LANGUAGE plpgsql;

COMMIT;
