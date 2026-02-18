


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."activity_status" AS ENUM (
    'pending',
    'inProgress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."activity_status" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'ict',
    'fom',
    'financialAdmin',
    'supervisor',
    'coordinator',
    'dataCollector',
    'reviewer',
    'countryDirector',
    'dataTeam',
    'projectManager',
    'seniorOperationsLead'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."classification_level" AS ENUM (
    'A',
    'B',
    'C'
);


ALTER TYPE "public"."classification_level" OWNER TO "postgres";


CREATE TYPE "public"."classification_role_scope" AS ENUM (
    'coordinator',
    'dataCollector',
    'supervisor'
);


ALTER TYPE "public"."classification_role_scope" OWNER TO "postgres";


CREATE TYPE "public"."payout_method" AS ENUM (
    'bank',
    'mobile_money',
    'manual'
);


ALTER TYPE "public"."payout_method" OWNER TO "postgres";


CREATE TYPE "public"."payout_status" AS ENUM (
    'requested',
    'approved',
    'declined',
    'paid',
    'cancelled'
);


ALTER TYPE "public"."payout_status" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'draft',
    'active',
    'onHold',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."project_type" AS ENUM (
    'infrastructure',
    'survey',
    'compliance',
    'monitoring',
    'training',
    'other'
);


ALTER TYPE "public"."project_type" OWNER TO "postgres";


CREATE TYPE "public"."wallet_tx_status" AS ENUM (
    'pending',
    'posted',
    'reversed',
    'failed'
);


ALTER TYPE "public"."wallet_tx_status" OWNER TO "postgres";


CREATE TYPE "public"."wallet_tx_type" AS ENUM (
    'earning',
    'adjustment_credit',
    'adjustment_debit',
    'payout_hold',
    'payout_paid',
    'reversal',
    'correction',
    'withdrawal',
    'down_payment'
);


ALTER TYPE "public"."wallet_tx_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_supervisor_to_down_payment_request"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  hub_supervisor_id UUID;
BEGIN
  IF NEW.hub_id IS NOT NULL THEN
    SELECT p.id INTO hub_supervisor_id
    FROM profiles p
    WHERE p.role IN ('supervisor', 'hubSupervisor')
    AND p.hub_id = NEW.hub_id
    AND p.status = 'active'
    LIMIT 1;
    
    IF hub_supervisor_id IS NOT NULL THEN
      NEW.supervisor_id := hub_supervisor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_supervisor_to_down_payment_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_total_cost_submission"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.total_cost_cents := 
    COALESCE(NEW.transportation_cost_cents, 0) +
    COALESCE(NEW.accommodation_cost_cents, 0) +
    COALESCE(NEW.meal_allowance_cents, 0) +
    COALESCE(NEW.other_costs_cents, 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_total_cost_submission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_hub"("target_hub_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT 
    public.is_admin_or_super() 
    OR public.get_user_hub_id() = target_hub_id
    OR target_hub_id IS NULL;
$$;


ALTER FUNCTION "public"."can_access_hub"("target_hub_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_submit_operational_costs"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  RETURN user_role IN (
    'Field Operation Manager (FOM)', 'fom', 'fieldOpManager',
    'Coordinator', 'coordinator',
    'CountryDirector', 'countryDirector', 'Country Director',
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'hubSupervisor', 'supervisor',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict'
  );
END;
$$;


ALTER FUNCTION "public"."can_submit_operational_costs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_messages_broadcast_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'chat:' || COALESCE(NEW.chat_id, OLD.chat_id)::text || ':messages',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."chat_messages_broadcast_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric DEFAULT NULL::numeric, "p_total_cost" numeric DEFAULT NULL::numeric, "p_classification_level" "text" DEFAULT NULL::"text", "p_role_scope" "text" DEFAULT NULL::"text", "p_fee_source" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_site RECORD;
  v_user_name TEXT;
  v_classification RECORD;
  v_fee_structure RECORD;
  v_fee NUMERIC;
  v_cl TEXT;  -- classification_level for additional_data (avoids unassigned v_classification when fee provided)
  v_rs TEXT;  -- role_scope for additional_data
BEGIN
  -- Get user name for notification
  SELECT COALESCE(full_name, username, 'Unknown') INTO v_user_name
  FROM profiles WHERE id = p_user_id;

  -- If fee not provided, calculate from classification
  IF p_enumerator_fee IS NULL THEN
    -- Get user's active classification
    SELECT classification_level, role_scope
    INTO v_classification
    FROM user_classifications
    WHERE user_id = p_user_id
      AND is_active = true
      AND (role_scope = 'dataCollector' OR role_scope = 'enumerator')
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_classification IS NOT NULL THEN
      -- Get fee structure for this classification
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO v_fee_structure
      FROM classification_fee_structures
      WHERE classification_level = v_classification.classification_level
        AND role_scope = v_classification.role_scope
        AND is_active = true
        AND valid_from <= NOW()
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_from DESC
      LIMIT 1;

      IF v_fee_structure IS NOT NULL THEN
        -- Calculate fee: base_fee * multiplier = SDG (fees stored directly in SDG)
        v_fee := ROUND(v_fee_structure.site_visit_base_fee_cents * v_fee_structure.complexity_multiplier, 2);
      ELSE
        v_fee := 50; -- Default fee if no structure found
      END IF;
    ELSE
      v_fee := 50; -- Default fee if no classification
    END IF;
  ELSE
    v_fee := p_enumerator_fee;
  END IF;

  -- Resolve classification/role_scope for additional_data (needed when client sends fee but null p_classification_level/p_role_scope)
  v_cl := p_classification_level;
  v_rs := p_role_scope;
  IF v_cl IS NULL OR v_rs IS NULL THEN
    SELECT classification_level::text, role_scope::text INTO v_cl, v_rs
    FROM user_classifications
    WHERE user_id = p_user_id
      AND is_active = true
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  -- Try to lock and claim the site atomically
  -- FIXED: Removed claimed_by column reference (doesn't exist in table)
  SELECT id, status, accepted_by, site_name, transport_fee
  INTO v_site
  FROM mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE SKIP LOCKED;

  -- Check if we got the lock
  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user.'
    );
  END IF;

  -- Verify site is in "Dispatched" status
  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  -- Check if already claimed (only using accepted_by which exists)
  IF v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'message', 'This site has already been claimed by another enumerator.'
    );
  END IF;

  -- Claim the site with enumerator fee
  -- Store claim info in additional_data since claimed_by/claimed_at columns don't exist
  UPDATE mmp_site_entries
  SET 
    status = 'Assigned',
    accepted_by = p_user_id,
    accepted_at = NOW(),
    enumerator_fee = v_fee,
    cost = COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
    additional_data = COALESCE(additional_data, '{}'::jsonb) || jsonb_build_object(
      'claimed_by', v_user_name,
      'claimed_at', NOW()::TEXT,
      'claim_type', 'first_claim',
      'claim_fee_calculation', jsonb_build_object(
        'enumerator_fee', v_fee,
        'transport_budget', COALESCE(v_site.transport_fee, 0),
        'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
        'classification_level', v_cl,
        'role_scope', v_rs,
        'fee_source', COALESCE(p_fee_source, 'classification'),
        'calculated_at', NOW()::TEXT,
        'calculated_for_user', p_user_id::TEXT
      )
    ),
    updated_at = NOW()
  WHERE id = p_site_id;

  -- Create notification: use schema with title_en, message_en NOT NULL and event_type, entity_type
  INSERT INTO notifications (
    user_id,
    recipient_id,
    event_type,
    entity_type,
    entity_id,
    title_en,
    message_en,
    action_url,
    type,
    title,
    message,
    link,
    related_entity_id,
    related_entity_type
  )
  VALUES (
    p_user_id,
    p_user_id,
    'assignments',
    'siteVisit',
    p_site_id::text,
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    'success',
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    p_site_id,
    'mmpFile'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully!',
    'site_name', v_site.site_name,
    'enumerator_fee', v_fee,
    'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SYSTEM_ERROR',
      'message', 'An error occurred: ' || SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric, "p_total_cost" numeric, "p_classification_level" "text", "p_role_scope" "text", "p_fee_source" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric, "p_total_cost" numeric, "p_classification_level" "text", "p_role_scope" "text", "p_fee_source" "text") IS 'Atomically claim a dispatched site for a user with classification-based fee calculation. Uses row-level locking to prevent race conditions. Stores the provided p_total_cost in the cost field to ensure calculated fees are persisted accurately.';



CREATE OR REPLACE FUNCTION "public"."create_wallet_for_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balances, total_earned, total_withdrawn, balance_cents, total_earned_cents, total_paid_out_cents)
  VALUES (
    NEW.id, 
    '{"SDG": 0}'::jsonb, 
    0, 
    0,
    0,
    0,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_wallet_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_wallet_transaction_on_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
  v_site_name text;
BEGIN
  -- Only process if status changed to 'Completed' or 'completed'
  IF (NEW.status IS DISTINCT FROM OLD.status) 
     AND (LOWER(NEW.status) = 'completed')
     AND (OLD.status IS NULL OR LOWER(OLD.status) != 'completed') THEN
    
    -- Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by)
    -- Handle type mismatch: accepted_by is text, others are uuid
    v_user_id := CASE
      WHEN NEW.accepted_by IS NOT NULL THEN 
        CASE 
          WHEN NEW.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
          THEN NEW.accepted_by::uuid
          ELSE NULL
        END
      WHEN NEW.claimed_by IS NOT NULL THEN NEW.claimed_by
      WHEN NEW.visit_completed_by IS NOT NULL THEN NEW.visit_completed_by
      ELSE NULL
    END;

    -- Skip if no user to pay
    IF v_user_id IS NULL THEN
      RAISE NOTICE 'No user to pay for site % (accepted_by: %, claimed_by: %, visit_completed_by: %)', 
        NEW.id, NEW.accepted_by, NEW.claimed_by, NEW.visit_completed_by;
      RETURN NEW;
    END IF;

    -- Calculate amount (priority: cost > enumerator_fee + transport_fee)
    v_amount := COALESCE(
      NULLIF(NEW.cost, 0),
      COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0),
      0
    );

    -- Skip if amount is zero or negative
    IF v_amount <= 0 THEN
      RAISE NOTICE 'No fee amount for site % (cost: %, enumerator_fee: %, transport_fee: %)', 
        NEW.id, NEW.cost, NEW.enumerator_fee, NEW.transport_fee;
      RETURN NEW;
    END IF;

    v_amount_cents := ROUND(v_amount * 100)::bigint;
    v_site_name := COALESCE(NEW.site_name, 'Site');

    -- Check if transaction already exists for this site visit
    IF EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE (site_visit_id = NEW.id OR related_site_visit_id = NEW.id)
        AND type = 'earning'
    ) THEN
      RAISE NOTICE 'Wallet transaction already exists for site visit %', NEW.id;
      RETURN NEW;
    END IF;

    -- Get or create wallet
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id;

    IF v_wallet_id IS NULL THEN
      -- Create new wallet
      INSERT INTO public.wallets (user_id, balances, total_earned, total_earned_cents, balance_cents)
      VALUES (
        v_user_id,
        jsonb_build_object('SDG', v_amount),
        v_amount,
        v_amount_cents,
        v_amount_cents
      )
      RETURNING id INTO v_wallet_id;

      v_current_balance := 0;
      v_new_balance := v_amount;
    ELSE
      -- Get current balance (prefer balance_cents if available, otherwise use balances JSONB)
      SELECT 
        COALESCE(
          CASE WHEN balance_cents IS NOT NULL THEN balance_cents / 100.0 ELSE NULL END,
          (balances->>'SDG')::numeric,
          0
        )
      INTO v_current_balance
      FROM public.wallets
      WHERE id = v_wallet_id;

      v_new_balance := v_current_balance + v_amount;

      -- Update wallet balance
      UPDATE public.wallets
      SET 
        balances = jsonb_set(
          COALESCE(balances, '{"SDG": 0}'::jsonb),
          '{SDG}',
          to_jsonb(v_new_balance)
        ),
        total_earned = COALESCE(total_earned, 0) + v_amount,
        total_earned_cents = COALESCE(total_earned_cents, 0) + v_amount_cents,
        balance_cents = ROUND(v_new_balance * 100)::bigint,
        updated_at = now()
      WHERE id = v_wallet_id;
    END IF;

    -- Create wallet transaction (using 'earning' type, not 'site_visit_fee')
    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      amount_cents,
      currency,
      site_visit_id,
      related_site_visit_id,
      description,
      balance_before,
      balance_after,
      status
    )
    VALUES (
      v_wallet_id,
      v_user_id,
      'earning',  -- FIXED: Changed from 'site_visit_fee' to 'earning'
      v_amount,
      v_amount_cents,
      'SDG',
      NEW.id,
      NEW.id,
      format('Site visit completed: %s', v_site_name),
      v_current_balance,
      v_new_balance,
      'pending'
    )
    RETURNING id INTO v_transaction_id;

    RAISE NOTICE 'Created wallet transaction % for site visit %: % SDG to user %', 
      v_transaction_id, NEW.id, v_amount, v_user_id;

  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."create_wallet_transaction_on_completion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_wallet_transaction_on_completion"() IS 'Automatically creates wallet transactions when site visits are marked as completed. Ensures transactions are created at database level regardless of application code path.';



CREATE OR REPLACE FUNCTION "public"."enforce_super_admin_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW.is_active = true THEN
    SELECT COUNT(*) INTO active_count
    FROM super_admins
    WHERE is_active = true
    AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 active super-admin accounts allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_super_admin_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_fee_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_level classification_level;
  v_scope classification_role_scope;
  v_base INTEGER;
  v_mult NUMERIC;
  v_fee NUMERIC;
  v_fee_source TEXT;
  v_transport NUMERIC;
  v_has_details BOOLEAN;
BEGIN
  -- Only act when site is taken and has an owner
  IF (LOWER(COALESCE(NEW.status,'')) IN ('assigned','accepted')) AND NEW.accepted_by IS NOT NULL THEN
    v_transport := COALESCE(NEW.transport_fee, 0);

    -- Detect if details already exist to avoid overwriting RPC results
    v_has_details := COALESCE( (COALESCE(NEW.additional_data, '{}'::jsonb) ? 'claim_fee_calculation'), false);

    -- Always calculate fee from classification for the assigned/accepted user
    SELECT classification_level, role_scope
    INTO v_level, v_scope
    FROM user_classifications
    WHERE user_id::text = NEW.accepted_by
      AND is_active = true
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_level IS NOT NULL AND v_scope IS NOT NULL THEN
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO v_base, v_mult
      FROM classification_fee_structures
      WHERE classification_level = v_level
        AND role_scope = v_scope
        AND is_active = true
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC
      LIMIT 1;

      IF v_base IS NOT NULL THEN
        v_fee := ROUND(COALESCE(v_base,0) * COALESCE(v_mult, 1), 2);
        v_fee_source := 'classification';
      ELSE
        v_fee := 50;
        v_fee_source := 'default';
      END IF;
    ELSE
      v_fee := 50;
      v_fee_source := 'default';
    END IF;

    NEW.enumerator_fee := v_fee;

    -- Ensure total cost if missing
    IF (NEW.cost IS NULL OR NEW.cost <= 0) THEN
      NEW.cost := COALESCE(NEW.enumerator_fee, 0) + v_transport;
    END IF;

    -- Only write details if absent to avoid overwriting RPC's info
    IF NOT v_has_details THEN
      NEW.additional_data := COALESCE(NEW.additional_data, '{}'::jsonb)
        || jsonb_build_object(
          'claim_fee_calculation', jsonb_build_object(
            'enumerator_fee', NEW.enumerator_fee,
            'transport_budget', v_transport,
            'total_payout', NEW.cost,
            'classification_level', COALESCE((v_level::text), NULL),
            'role_scope', COALESCE((v_scope::text), NULL),
            'fee_source', v_fee_source,
            'calculated_at', NOW()::text,
            'calculated_for_user', NEW.accepted_by
          )
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_fee_on_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_default_payment_method"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If setting is_default to true, unset all other defaults for this user
  IF NEW.is_default = true THEN
    UPDATE public.payment_methods
    SET is_default = false, updated_at = now()
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;

  -- If this is the first payment method, make it default
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_methods
    WHERE user_id = NEW.user_id AND is_default = true
  ) THEN
    NEW.is_default := true;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_default_payment_method"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_wallet_row"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.wallets(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end
$$;


ALTER FUNCTION "public"."ensure_wallet_row"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_wallet_credit_on_site_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_amount_cents bigint := 0;
  v_currency text;
  v_user_id uuid;
begin
  -- Only act when status transitions to 'completed'
  if tg_op = 'UPDATE'
     and coalesce(old.status,'') is distinct from 'completed'
     and new.status = 'completed' then

    -- Idempotency: don't create duplicate earning for same visit
    if exists (
      select 1
      from public.wallet_transactions wt
      where wt.related_site_visit_id = new.id
        and wt.type = 'earning'::public.wallet_tx_type
    ) then
      return new;
    end if;

    -- Determine currency and amount from fees JSON
    v_currency := coalesce(new.fees ->> 'currency', 'SDG');

    if new.fees is not null and (new.fees ->> 'total') is not null then
      v_amount_cents := round(((new.fees ->> 'total')::numeric) * 100)::bigint;
    end if;

    if v_amount_cents > 0 then
      v_user_id := coalesce(new.assigned_to, new.user_id);

      insert into public.wallet_transactions (
        user_id,
        amount_cents,
        currency,
        type,
        status,
        memo,
        related_site_visit_id,
        visit_code
      )
      values (
        v_user_id,
        v_amount_cents,
        v_currency,
        'earning'::public.wallet_tx_type,
        'posted'::public.wallet_tx_status,
        'Auto-credit on site completion',
        new.id,
        coalesce(new.site_code, new.site_name)
      );
    end if;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."fn_wallet_credit_on_site_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_super_admin_count"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM super_admins WHERE is_active = true);
END;
$$;


ALTER FUNCTION "public"."get_active_super_admin_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."operational_cost_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_category" "text" NOT NULL,
    "hub_id" "text",
    "project_id" "uuid",
    "mmp_file_id" "uuid",
    "submitted_by" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "submitter_role" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'SDG'::"text",
    "description" "text" NOT NULL,
    "expense_date" "date" NOT NULL,
    "vendor" "text",
    "reference_number" "text",
    "supporting_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tier1_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tier1_approved_by" "uuid",
    "tier1_approved_at" timestamp with time zone,
    "tier1_notes" "text",
    "rejection_reason" "text",
    "tier2_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "tier2_approved_by" "uuid",
    "tier2_approved_at" timestamp with time zone,
    "tier2_notes" "text",
    "wallet_transaction_id" "uuid",
    "paid_at" timestamp with time zone,
    "paid_amount_cents" integer,
    "payment_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier3_status" "text",
    "tier3_approved_by" "uuid",
    "tier3_approved_at" timestamp with time zone,
    "tier3_notes" "text",
    CONSTRAINT "operational_cost_submissions_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "operational_cost_submissions_expense_category_check" CHECK (("expense_category" = ANY (ARRAY['permits'::"text", 'incentives'::"text", 'communications'::"text", 'training'::"text", 'general_transport'::"text", 'equipment'::"text", 'printing'::"text", 'meetings'::"text", 'other'::"text"]))),
    CONSTRAINT "operational_cost_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'under_review'::"text", 'approved'::"text", 'rejected'::"text", 'paid'::"text", 'cancelled'::"text", 'reconciled'::"text"]))),
    CONSTRAINT "operational_cost_submissions_tier1_status_check" CHECK (("tier1_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'changes_requested'::"text"]))),
    CONSTRAINT "operational_cost_submissions_tier2_status_check" CHECK (("tier2_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "operational_cost_submissions_tier3_status_check" CHECK ((("tier3_status" IS NULL) OR ("tier3_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))))
);


ALTER TABLE "public"."operational_cost_submissions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_operational_cost_submissions"() RETURNS SETOF "public"."operational_cost_submissions"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  IF is_admin_or_super_admin() THEN
    RETURN QUERY SELECT * FROM operational_cost_submissions ORDER BY created_at DESC;
  ELSE
    RETURN QUERY SELECT * FROM operational_cost_submissions 
      WHERE submitted_by = auth.uid() ORDER BY created_at DESC;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_all_operational_cost_submissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classification_fee"("p_classification_level" "public"."classification_level", "p_role_scope" "public"."classification_role_scope", "p_currency" "text" DEFAULT 'SDG'::"text") RETURNS TABLE("base_fee_cents" integer, "transport_fee_cents" integer, "complexity_multiplier" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cfs.site_visit_base_fee_cents,
    cfs.site_visit_transport_fee_cents,
    cfs.complexity_multiplier
  FROM classification_fee_structures cfs
  WHERE 
    cfs.classification_level = p_classification_level
    AND cfs.role_scope = p_role_scope
    AND cfs.currency = p_currency
    AND cfs.is_active = true
    AND cfs.effective_from <= now()
    AND (cfs.effective_until IS NULL OR cfs.effective_until > now())
  ORDER BY cfs.effective_from DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_classification_fee"("p_classification_level" "public"."classification_level", "p_role_scope" "public"."classification_role_scope", "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_feedback_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result json;
begin
  -- Check if user has admin privileges
  if not exists (
    select 1 from public.profiles 
    where id = auth.uid() 
    and role in ('admin', 'superAdmin', 'ictSupport')
  ) then
    raise exception 'Access denied. Admin privileges required.';
  end if;

  select json_build_object(
    'total_feedback', count(*),
    'new_feedback', count(*) filter (where status = 'new'),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'resolved', count(*) filter (where status = 'resolved'),
    'avg_rating', round(avg(
      case reaction
        when '😃' then 5
        when '🙂' then 4
        when '😐' then 3
        when '🙁' then 2
        when '😡' then 1
        else null
      end
    )::numeric, 2),
    'recent_feedback', count(*) filter (where created_at >= now() - interval '7 days')
  ) into result
  from public.feedback;

  return result;
end;
$$;


ALTER FUNCTION "public"."get_feedback_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_roles_with_permissions"() RETURNS TABLE("role_id" "uuid", "role_name" character varying, "display_name" character varying, "description" "text", "is_system_role" boolean, "is_active" boolean, "permissions" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT 
        r.id,
        r.name,
        r.display_name,
        r.description,
        r.is_system_role,
        r.is_active,
        COALESCE(
            json_agg(
                json_build_object(
                    'resource', p.resource,
                    'action', p.action,
                    'conditions', p.conditions
                )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
        ) as permissions
    FROM public.roles r
    LEFT JOIN public.permissions p ON r.id = p.role_id
    WHERE r.is_active = true
    GROUP BY r.id, r.name, r.display_name, r.description, r.is_system_role, r.is_active
    ORDER BY r.is_system_role DESC, r.name;
$$;


ALTER FUNCTION "public"."get_roles_with_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") RETURNS TABLE("id" "uuid", "site_name" "text", "status" "text", "verified_by_user_id" "uuid", "verified_by_name" "text", "verified_by_email" "text", "verified_at" timestamp with time zone, "completed_by_user_id" "uuid", "completed_by_name" "text", "completed_by_email" "text", "accepted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mse.id,
    mse.site_name,
    mse.status,
    mse.verified_by_user_id,
    verifier.full_name as verified_by_name,
    verifier.email as verified_by_email,
    mse.verified_at,
    mse.completed_by_user_id,
    completer.full_name as completed_by_name,
    completer.email as completed_by_email,
    mse.accepted_at
  FROM public.mmp_site_entries mse
  LEFT JOIN public.profiles verifier ON mse.verified_by_user_id = verifier.id
  LEFT JOIN public.profiles completer ON mse.completed_by_user_id = completer.id
  WHERE mse.id = site_entry_id;
END;
$$;


ALTER FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") IS 'Helper function to retrieve site entry with verifier and completer user details in a single query';



CREATE OR REPLACE FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") RETURNS TABLE("id" "uuid", "site_name" "text", "forwarded_by_user_id" "uuid", "forwarded_by_name" "text", "forwarded_by_email" "text", "forwarded_to_user_id" "uuid", "forwarded_to_name" "text", "forwarded_to_email" "text", "forwarded_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mse.id,
    mse.site_name,
    mse.forwarded_by_user_id,
    forwarder.full_name as forwarded_by_name,
    forwarder.email as forwarded_by_email,
    mse.forwarded_to_user_id,
    coordinator.full_name as forwarded_to_name,
    coordinator.email as forwarded_to_email,
    mse.forwarded_at
  FROM public.mmp_site_entries mse
  LEFT JOIN public.profiles forwarder ON mse.forwarded_by_user_id = forwarder.id
  LEFT JOIN public.profiles coordinator ON mse.forwarded_to_user_id = coordinator.id
  WHERE mse.id = site_entry_id;
END;
$$;


ALTER FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") IS 'Helper function to retrieve site entry with forwarded user details (who forwarded and to whom)';



CREATE OR REPLACE FUNCTION "public"."get_user_hub_id"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT hub_id FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_hub_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") RETURNS TABLE("resource" character varying, "action" character varying, "conditions" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT DISTINCT p.resource, p.action, p.conditions
    FROM public.permissions p
    JOIN public.user_roles ur ON (
        (ur.role = (SELECT name FROM public.roles WHERE id = p.role_id))
        OR ur.role_id = p.role_id
    )
    WHERE ur.user_id = user_uuid
    AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id = p.role_id AND r.is_active = true);
$$;


ALTER FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if new.cost_acknowledged is distinct from old.cost_acknowledged then
        new.updated_at = now();
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    role,
    hub_id,
    state_id,
    locality_id,
    phone,
    employee_id,
    avatar_url,
    status,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'dataCollector'),
    NEW.raw_user_meta_data->>'hubId',  -- NO CAST - hub_id is TEXT
    NEW.raw_user_meta_data->>'stateId',
    NEW.raw_user_meta_data->>'localityId',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'employeeId',
    NEW.raw_user_meta_data->>'avatar',
    'pending',
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Creates a profile automatically when a new user is created in auth.users';



CREATE OR REPLACE FUNCTION "public"."handle_profile_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- Delete the corresponding auth.users record if it still exists
  -- We check if it exists first to avoid errors and handle the case where
  -- the user was already deleted (which would have cascaded to delete the profile)
  if exists (select 1 from auth.users where id = old.id) then
    delete from auth.users where id = old.id;
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."handle_profile_deleted"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_profile_deleted"() IS 'Deletes the corresponding auth.users record when a profile is deleted, ensuring bidirectional cascade deletion';



CREATE OR REPLACE FUNCTION "public"."has_role"("role_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = role_name
  );
$$;


ALTER FUNCTION "public"."has_role"("role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin', 'superadmin')
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_super"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_super_admin() OR public.is_admin();
$$;


ALTER FUNCTION "public"."is_admin_or_super"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
  has_admin_user_role BOOLEAN;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  IF user_role IN (
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'CountryDirector', 'countryDirector', 'Country Director',
    'FinancialAdmin', 'finance_admin',
    'ICT', 'ict'
  ) THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true
  ) INTO has_admin_user_role;
  
  IF has_admin_user_role THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND LOWER(role) IN ('admin', 'superadmin', 'financialadmin', 'ict')
  ) INTO has_admin_user_role;
  
  RETURN has_admin_user_role;
END;
$$;


ALTER FUNCTION "public"."is_admin_or_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
        AND r.name IN ('admin', 'super_admin')
    );
END;
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coordinator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coordinator'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'coordinator'
  );
$$;


ALTER FUNCTION "public"."is_coordinator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_cost_reviewer"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  profile_role TEXT;
  has_reviewer_user_role BOOLEAN;
BEGIN
  SELECT role INTO profile_role FROM profiles WHERE id = auth.uid();
  
  IF profile_role IN (
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'CountryDirector', 'countryDirector', 'Country Director',
    'FinancialAdmin', 'finance_admin',
    'Field Operation Manager (FOM)', 'fom', 'fieldOpManager',
    'hubSupervisor', 'supervisor',
    'ICT', 'ict'
  ) THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true
  ) INTO has_reviewer_user_role;
  
  IF has_reviewer_user_role THEN
    RETURN TRUE;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND LOWER(role) IN ('admin', 'superadmin', 'financialadmin', 'fom', 'ict', 'hubsupervisor', 'supervisor')
  ) INTO has_reviewer_user_role;
  
  RETURN has_reviewer_user_role;
END;
$$;


ALTER FUNCTION "public"."is_cost_reviewer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_data_collector"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'dataCollector'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'dataCollector'
  );
$$;


ALTER FUNCTION "public"."is_data_collector"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_financial_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'financialAdmin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'financialAdmin'
  );
$$;


ALTER FUNCTION "public"."is_financial_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_fom"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'fom'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'fom'
  );
$$;


ALTER FUNCTION "public"."is_fom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_hub_supervisor"("check_hub_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
  user_hub TEXT;
BEGIN
  SELECT role, hub_id INTO user_role, user_hub FROM profiles WHERE id = auth.uid();
  RETURN user_hub = check_hub_id AND user_role IN (
    'hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)', 'fom'
  );
END;
$$;


ALTER FUNCTION "public"."is_hub_supervisor"("check_hub_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.mmp_site_entries 
    WHERE id = site_entry_id 
      AND forwarded_at IS NOT NULL
  );
END;
$$;


ALTER FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") IS 'Helper function to check if a site entry has been forwarded to a coordinator';



CREATE OR REPLACE FUNCTION "public"."is_super_admin"("check_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = check_user_id
    AND is_active = true
  );
$$;


ALTER FUNCTION "public"."is_super_admin"("check_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") IS 'Check if a user is an active super admin. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';



CREATE OR REPLACE FUNCTION "public"."is_supervisor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'supervisor'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor'
  );
$$;


ALTER FUNCTION "public"."is_supervisor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_admins_on_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  admin_user RECORD;
  notification_title TEXT;
  notification_message TEXT;
  action_url TEXT;
BEGIN
  -- Skip if this is a system-generated audit log with no meaningful information (to avoid loops)
  -- But still notify on important system events
  IF NEW.actor_role = 'system' AND NEW.actor_id = 'system' AND NEW.severity IN ('info') THEN
    -- Only skip low-severity system logs
    RETURN NEW;
  END IF;

  -- Build notification content from audit log
  notification_title := COALESCE(NEW.description, NEW.action || ' in ' || NEW.module);
  notification_message := COALESCE(NEW.description, '') || COALESCE(
    CASE 
      WHEN NEW.entity_name IS NOT NULL THEN ' - ' || NEW.entity_name
      ELSE ''
    END,
    ''
  );

  -- Build action URL based on entity type
  action_url := CASE NEW.entity_type
    WHEN 'mmp_file' OR NEW.entity_type LIKE 'mmp%' THEN '/mmp/' || NEW.entity_id
    WHEN 'site_visit' OR NEW.entity_type LIKE 'site%' THEN '/mmp?site=' || NEW.entity_id
    WHEN 'transaction' THEN '/wallet'
    WHEN 'user' THEN '/users'
    WHEN 'project' THEN '/projects/' || NEW.entity_id
    WHEN 'wallet' THEN '/wallet'
    ELSE NULL
  END;

  -- Find all admin users (check both profiles.role and user_roles)
  FOR admin_user IN
    SELECT DISTINCT p.id, p.email, p.full_name
    FROM profiles p
    WHERE (
      -- Check direct role in profiles table
      p.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
      -- OR check user_roles table
      OR EXISTS (
        SELECT 1 
        FROM user_roles ur 
        WHERE ur.user_id = p.id 
        AND (
          ur.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
          OR EXISTS (
            SELECT 1 
            FROM roles r 
            WHERE r.id = ur.role_id 
            AND LOWER(r.name) IN ('admin', 'superadmin', 'super_admin')
          )
        )
      )
    )
    AND p.status != 'deleted'  -- Exclude deleted users
  LOOP
    -- Create notification for each admin
    -- Use the extended schema fields (title_en, message_en, etc.) and also set legacy fields for compatibility
    BEGIN
      INSERT INTO notifications (
          recipient_id,
        user_id,  -- Also set user_id for compatibility with legacy code
        title_en,
        title_ar,
        message_en,
        message_ar,
        title,  -- Legacy field
        message,  -- Legacy field
        event_type,
        entity_type,
        entity_id,
        related_entity_type,  -- Legacy field
        related_entity_id,  -- Legacy field
        action_url,
        link,  -- Legacy field
        priority,
        status,
        triggered_by,
        triggered_by_name,
        workflow_stage,
        type,  -- Legacy field - map from severity
        metadata,
        created_at
      ) VALUES (
        admin_user.id,
        admin_user.id,
        notification_title,
        notification_title,  -- Arabic title same as English for now
        notification_message,
        notification_message,  -- Arabic message same as English for now
        notification_title,  -- Legacy title field
        notification_message,  -- Legacy message field
        NEW.module || '_' || LOWER(NEW.action),
        NEW.entity_type,
        NEW.entity_id,
        NEW.entity_type,  -- Legacy related_entity_type
        NEW.entity_id,  -- Legacy related_entity_id
        action_url,
        action_url,  -- Legacy link field
        CASE NEW.severity
          WHEN 'error' THEN 'high'
          WHEN 'warning' THEN 'high'
          WHEN 'critical' THEN 'urgent'
          ELSE 'normal'
        END,
        'pending',
        CASE 
          WHEN NEW.actor_id != 'system' AND NEW.actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
          THEN NEW.actor_id::uuid
          ELSE NULL
        END,
        COALESCE(NEW.actor_name, 'System'),
        NEW.workflow_step,
        CASE NEW.severity
          WHEN 'error' OR NEW.severity = 'critical' THEN 'error'
          WHEN 'warning' THEN 'warning'
          ELSE 'info'
        END,  -- Legacy type field
        jsonb_build_object(
          'audit_log_id', NEW.id,
          'timestamp', NEW.timestamp,
          'module', NEW.module,
          'action', NEW.action,
          'severity', NEW.severity,
          'actor_id', NEW.actor_id,
          'actor_name', NEW.actor_name,
          'entity_name', NEW.entity_name
        ),
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the trigger
      RAISE WARNING 'Failed to create notification for admin %: %', admin_user.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."notify_admins_on_audit_log"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_admins_on_audit_log"() IS 'Automatically creates in-app notifications for all admin users when an audit log entry is created, ensuring admins are notified of all system activities';



CREATE OR REPLACE FUNCTION "public"."payout_req_after_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform public.recalc_wallet(coalesce(new.user_id, old.user_id));
  return null;
end
$$;


ALTER FUNCTION "public"."payout_req_after_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_req_ensure_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.ensure_wallet_row(new.user_id);
  return new;
end
$$;


ALTER FUNCTION "public"."payout_req_ensure_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_wallet"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_earned bigint;
  v_total_paid_out bigint;
  v_balance bigint;
  v_pending_payout bigint;
begin
  select coalesce(sum(amount_cents),0)
    into v_total_earned
  from public.wallet_transactions
  where user_id = p_user_id and status = 'posted' and type in ('earning','adjustment_credit');

  select coalesce(sum(amount_cents),0)
    into v_total_paid_out
  from public.wallet_transactions
  where user_id = p_user_id and status = 'posted' and type in ('payout_paid');

  select
    coalesce(sum(case when status='posted' and type in ('earning','adjustment_credit') then amount_cents else 0 end),0)
    - coalesce(sum(case when status='posted' and type in ('adjustment_debit','payout_paid') then amount_cents else 0 end),0)
  into v_balance
  from public.wallet_transactions
  where user_id = p_user_id;

  select coalesce(sum(amount_cents),0)
    into v_pending_payout
  from public.payout_requests
  where user_id = p_user_id and status in ('requested','approved');

  update public.wallets
  set total_earned_cents = v_total_earned,
      total_paid_out_cents = v_total_paid_out,
      pending_payout_cents = v_pending_payout,
      balance_cents = v_balance,
      updated_at = now()
  where user_id = p_user_id;
end
$$;


ALTER FUNCTION "public"."recalc_wallet"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text" DEFAULT 'Administrative reclaim'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_site RECORD;
  v_admin_role TEXT;
  v_admin_name TEXT;
  v_former_assignee TEXT;
BEGIN
  -- Get admin info
  SELECT role, COALESCE(full_name, username, 'Admin') INTO v_admin_role, v_admin_name
  FROM profiles WHERE id = p_admin_id;

  -- Verify admin permissions
  IF v_admin_role NOT IN ('admin', 'super_admin', 'superAdmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED', 'message', 'Only admins can reclaim sites.');
  END IF;

  -- Get current site info
  SELECT id, status, accepted_by, site_name INTO v_site
  FROM mmp_site_entries WHERE id = p_site_id;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Site not found.');
  END IF;

  v_former_assignee := v_site.accepted_by;

  -- Reset ALL claim-related fields so site can be claimed again
  UPDATE mmp_site_entries SET 
    status = 'Dispatched',
    accepted_by = NULL,
    accepted_at = NULL,
    visit_started_at = NULL,
    visit_started_by = NULL,
    visit_completed_at = NULL,
    visit_completed_by = NULL,
    enumerator_fee = NULL,
    cost = NULL,
    additional_data = (
      COALESCE(additional_data, '{}'::jsonb) 
      - 'claimed_by' - 'claimed_at' - 'claim_type' - 'claim_fee_calculation'
    ) || jsonb_build_object(
      'reclaimed_at', NOW()::TEXT,
      'reclaimed_by', p_admin_id::TEXT,
      'reclaimed_by_name', v_admin_name,
      'reclaim_reason', p_reason,
      'former_assignee', v_former_assignee
    ),
    updated_at = NOW()
  WHERE id = p_site_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Site reclaimed and available for claiming.',
    'site_name', v_site.site_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'SYSTEM_ERROR', 'message', 'Error: ' || SQLERRM);
END;
$$;


ALTER FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") IS 'Allows admins to reclaim/release claimed sites back to the dispatch pool';



CREATE OR REPLACE FUNCTION "public"."record_cost_approval_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  actor_user_id UUID;
  actor_user_role TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    actor_user_id := COALESCE(NEW.reviewed_by, auth.uid());
  ELSIF (TG_OP = 'INSERT') THEN
    actor_user_id := NEW.submitted_by;
  END IF;

  SELECT role INTO actor_user_role
  FROM user_roles
  WHERE user_id = actor_user_id
  ORDER BY 
    CASE LOWER(role)
      WHEN 'admin' THEN 1
      WHEN 'ict' THEN 2
      WHEN 'fom' THEN 3
      WHEN 'financialadmin' THEN 4
      ELSE 5
    END
  LIMIT 1;

  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    INSERT INTO cost_approval_history (
      submission_id, action, actor_id, actor_role,
      previous_status, new_status,
      previous_amount_cents, new_amount_cents,
      notes, changes
    ) VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'paid' THEN 'paid'
        ELSE 'status_changed'
      END,
      actor_user_id, actor_user_role,
      OLD.status, NEW.status,
      OLD.total_cost_cents, NEW.total_cost_cents,
      NEW.reviewer_notes,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO cost_approval_history (
      submission_id, action, actor_id, actor_role,
      new_status, new_amount_cents, notes, changes
    ) VALUES (
      NEW.id, 'submitted', actor_user_id, actor_user_role,
      NEW.status, NEW.total_cost_cents, NEW.submission_notes,
      jsonb_build_object('submission_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_cost_approval_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_mmp_files_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


ALTER FUNCTION "public"."set_mmp_files_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_roles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_roles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_site_location_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_site_location_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_site_visits_fees_on_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_calc jsonb;
  v_enum NUMERIC;
  v_trans NUMERIC;
  v_total NUMERIC;
  v_level TEXT;
  v_scope TEXT;
  v_source TEXT;
  v_calc_at TEXT;
  v_calc_user TEXT;
BEGIN
  -- Only act when the site has been taken
  IF (LOWER(COALESCE(NEW.status,'')) IN ('assigned','accepted')) AND NEW.accepted_by IS NOT NULL THEN
    v_calc := COALESCE(NEW.additional_data->'claim_fee_calculation', '{}'::jsonb);

    v_enum := COALESCE(NEW.enumerator_fee, (v_calc->>'enumerator_fee')::numeric, 0);
    v_trans := COALESCE(NEW.transport_fee, (v_calc->>'transport_budget')::numeric, 0);
    v_total := COALESCE(NEW.cost, (v_calc->>'total_payout')::numeric, v_enum + v_trans);

    v_level := NULLIF(COALESCE(v_calc->>'classification_level', NULL), '');
    v_scope := NULLIF(COALESCE(v_calc->>'role_scope', NULL), '');
    v_source := COALESCE(v_calc->>'fee_source', 'classification');
    v_calc_at := COALESCE(v_calc->>'calculated_at', NOW()::text);
    v_calc_user := COALESCE(v_calc->>'calculated_for_user', NEW.accepted_by);

    -- Update site_visits if exists for this mmp_site_entry
    UPDATE public.site_visits sv
    SET
      enumerator_fee = v_enum,
      transport_fee = v_trans,
      cost = v_total,
      fees = COALESCE(sv.fees, '{}'::jsonb) || jsonb_build_object(
        'enumerator_fee', v_enum,
        'transport_budget', v_trans,
        'total_payout', v_total,
        'classification_level', v_level,
        'role_scope', v_scope,
        'fee_source', v_source,
        'calculated_at', v_calc_at,
        'calculated_for_user', v_calc_user,
        'currency', 'SDG'
      )
    WHERE sv.mmp_site_entry_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_site_visits_fees_on_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_chat_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_chat_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_app_versions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_app_versions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_classification_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_classification_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_classification_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_classification_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_cost_submission_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_cost_submission_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_down_payment_remaining_amount"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.remaining_amount := NEW.requested_amount - COALESCE(NEW.total_paid_amount, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_down_payment_remaining_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_hub_ops_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_hub_ops_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_active_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.last_active_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_last_active_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mmp_site_entries_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_mmp_site_entries_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_operational_cost_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_operational_cost_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_site_visit_costs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_site_visit_costs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_support_tickets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_support_tickets_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_roles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_roles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_wallet_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  amount_change bigint;
  new_balance_cents bigint;
  abs_amount_cents bigint;
BEGIN
  -- Update wallet balance when transaction is posted
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    -- Get absolute amount for calculations
    abs_amount_cents := ABS(NEW.amount_cents);
    
    -- Determine amount change (positive for credits, negative for debits)
    -- If amount_cents is negative, it's already a debit; if positive, check type
    amount_change := CASE 
      WHEN NEW.amount_cents < 0 THEN NEW.amount_cents  -- Already negative
      WHEN NEW.type IN ('withdrawal', 'adjustment_debit', 'penalty') THEN -abs_amount_cents
      ELSE abs_amount_cents
    END;
    
    -- Get current balance and calculate new balance
    SELECT balance_cents INTO new_balance_cents FROM public.wallets WHERE id = NEW.wallet_id;
    new_balance_cents := new_balance_cents + amount_change;
    
    -- Ensure balance doesn't go negative (should be handled by application, but safety check)
    IF new_balance_cents < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance. Current: %, Requested: %', 
        (SELECT balance_cents FROM public.wallets WHERE id = NEW.wallet_id),
        abs_amount_cents;
    END IF;
    
    -- Update wallet
    UPDATE public.wallets
    SET 
      balance_cents = new_balance_cents,
      total_earned_cents = CASE 
        WHEN NEW.type IN ('site_visit_fee', 'earning', 'bonus', 'adjustment_credit') 
          OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal', 'adjustment_debit', 'penalty'))
        THEN total_earned_cents + abs_amount_cents
        ELSE total_earned_cents
      END,
      total_paid_out_cents = CASE 
        WHEN NEW.type IN ('withdrawal', 'adjustment_debit') 
          OR (NEW.amount_cents < 0)
        THEN total_paid_out_cents + abs_amount_cents
        ELSE total_paid_out_cents
      END,
      -- Update backward compatibility fields
      total_earned = CASE 
        WHEN NEW.type IN ('site_visit_fee', 'earning', 'bonus', 'adjustment_credit')
          OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal', 'adjustment_debit', 'penalty'))
        THEN COALESCE(total_earned, 0) + (abs_amount_cents::numeric / 100.0)
        ELSE COALESCE(total_earned, 0)
      END,
      total_withdrawn = CASE 
        WHEN NEW.type IN ('withdrawal', 'adjustment_debit')
          OR (NEW.amount_cents < 0)
        THEN COALESCE(total_withdrawn, 0) + (abs_amount_cents::numeric / 100.0)
        ELSE COALESCE(total_withdrawn, 0)
      END,
      balances = jsonb_set(
        COALESCE(balances, '{"SDG": 0}'::jsonb),
        ARRAY[COALESCE(NEW.currency, 'SDG')],
        to_jsonb((new_balance_cents::numeric / 100.0)::text::numeric)
      ),
      updated_at = now()
    WHERE id = NEW.wallet_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_wallet_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_wallet_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_wallet_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_withdrawal_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_withdrawal_requests_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_permission"("user_uuid" "uuid", "check_resource" character varying, "check_action" character varying) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.get_user_permissions(user_uuid) p
        WHERE p.resource = check_resource
        AND p.action = check_action
    );
$$;


ALTER FUNCTION "public"."user_has_permission"("user_uuid" "uuid", "check_resource" character varying, "check_action" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_tx_after_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.recalc_wallet(coalesce(new.user_id, old.user_id));
  return null;
end
$$;


ALTER FUNCTION "public"."wallet_tx_after_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_tx_ensure_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.ensure_wallet_row(new.user_id);
  return new;
end
$$;


ALTER FUNCTION "public"."wallet_tx_ensure_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_tx_set_posted_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if (new.status = 'posted'::public.wallet_tx_status)
     and (tg_op = 'INSERT' or old.status is distinct from 'posted'::public.wallet_tx_status) then
    new.posted_at := coalesce(new.posted_at, now());
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."wallet_tx_set_posted_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_versions" (
    "id" integer NOT NULL,
    "platform" character varying(20) NOT NULL,
    "current_version" character varying(20) NOT NULL,
    "minimum_supported" character varying(20) NOT NULL,
    "latest_version" character varying(20) NOT NULL,
    "changelog" "text",
    "download_url" character varying(500),
    "force_update" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "app_versions_platform_check" CHECK ((("platform")::"text" = ANY ((ARRAY['web'::character varying, 'mobile'::character varying])::"text"[])))
);


ALTER TABLE "public"."app_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_versions" IS 'Stores version information for web and mobile apps to manage compatibility';



COMMENT ON COLUMN "public"."app_versions"."platform" IS 'Platform type: web or mobile';



COMMENT ON COLUMN "public"."app_versions"."current_version" IS 'Currently deployed version';



COMMENT ON COLUMN "public"."app_versions"."minimum_supported" IS 'Oldest version that still works with current backend';



COMMENT ON COLUMN "public"."app_versions"."latest_version" IS 'Latest available version for download';



COMMENT ON COLUMN "public"."app_versions"."changelog" IS 'Release notes for latest version';



COMMENT ON COLUMN "public"."app_versions"."download_url" IS 'URL to download latest APK (mobile only)';



COMMENT ON COLUMN "public"."app_versions"."force_update" IS 'Whether to force users to update';



CREATE SEQUENCE IF NOT EXISTS "public"."app_versions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."app_versions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."app_versions_id_seq" OWNED BY "public"."app_versions"."id";



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_name" "text",
    "actor_id" "text" DEFAULT 'system'::"text" NOT NULL,
    "actor_name" "text" DEFAULT 'System'::"text" NOT NULL,
    "actor_role" "text" DEFAULT 'system'::"text",
    "actor_email" "text",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "workflow_step" "text",
    "previous_state" "jsonb",
    "new_state" "jsonb",
    "changes" "jsonb",
    "metadata" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "session_id" "text",
    "description" "text" NOT NULL,
    "details" "text",
    "tags" "text"[],
    "related_entity_ids" "text"[],
    "duration" integer,
    "success" boolean DEFAULT true NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_budget_id" "uuid",
    "mmp_budget_id" "uuid",
    "alert_type" character varying(50) NOT NULL,
    "severity" character varying(20) DEFAULT 'warning'::character varying,
    "threshold_percentage" integer,
    "title" character varying(255) NOT NULL,
    "message" "text",
    "status" character varying(20) DEFAULT 'active'::character varying,
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."budget_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_budget_id" "uuid",
    "mmp_budget_id" "uuid",
    "site_visit_id" "uuid",
    "wallet_transaction_id" "uuid",
    "transaction_type" character varying(50) NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" character varying(3) DEFAULT 'SDG'::character varying,
    "category" character varying(50),
    "balance_before_cents" bigint,
    "balance_after_cents" bigint,
    "description" "text",
    "metadata" "jsonb",
    "reference_number" character varying(100),
    "requires_approval" boolean DEFAULT false,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."budget_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "call_id" "text",
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "caller_name" "text",
    "callee_name" "text",
    "caller_avatar" "text",
    "callee_avatar" "text",
    "is_video" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'ended'::"text" NOT NULL,
    "duration_seconds" integer,
    "notes" "text",
    "was_recorded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "call_history_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'missed'::"text", 'rejected'::"text", 'busy'::"text", 'failed'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."call_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "status" "text" NOT NULL,
    "duration" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "call_type" "text" DEFAULT 'audio'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "call_logs_call_type_check" CHECK (("call_type" = ANY (ARRAY['audio'::"text", 'video'::"text"]))),
    CONSTRAINT "call_logs_direction_check" CHECK (("direction" = ANY (ARRAY['outgoing'::"text", 'incoming'::"text"]))),
    CONSTRAINT "call_logs_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'missed'::"text", 'rejected'::"text", 'no_answer'::"text"])))
);


ALTER TABLE "public"."call_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_message_reads" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_message_reads" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_message_reads" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "content_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "attachments" "jsonb",
    "metadata" "jsonb",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chat_messages_content_type_check" CHECK (("content_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'file'::"text", 'location'::"text", 'audio'::"text"]))),
    CONSTRAINT "chat_messages_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_messages" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."chat_participants" (
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_participants" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_participants" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Chat'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "is_group" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "state_id" "text",
    "related_entity_id" "text",
    "related_entity_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pair_key" "text",
    CONSTRAINT "chats_related_entity_type_check" CHECK (("related_entity_type" = ANY (ARRAY['mmpFile'::"text", 'project'::"text"]))),
    CONSTRAINT "chats_type_check" CHECK (("type" = ANY (ARRAY['private'::"text", 'group'::"text", 'state-group'::"text"])))
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


COMMENT ON TABLE "public"."chats" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."classification_fee_structures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classification_level" "public"."classification_level" NOT NULL,
    "role_scope" "public"."classification_role_scope" NOT NULL,
    "site_visit_base_fee_cents" integer DEFAULT 0 NOT NULL,
    "site_visit_transport_fee_cents" integer DEFAULT 0 NOT NULL,
    "complexity_multiplier" numeric(3,2) DEFAULT 1.0,
    "currency" "text" DEFAULT 'SDG'::"text",
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_until" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "updated_by" "uuid",
    "change_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_complexity" CHECK (("complexity_multiplier" >= (0)::numeric)),
    CONSTRAINT "valid_fee_amounts" CHECK ((("site_visit_base_fee_cents" >= 0) AND ("site_visit_transport_fee_cents" >= 0))),
    CONSTRAINT "valid_validity_dates" CHECK ((("effective_until" IS NULL) OR ("effective_until" > "effective_from")))
);


ALTER TABLE "public"."classification_fee_structures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comprehensive_monitoring_checklists" (
    "id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "enumerator_name" "text" NOT NULL,
    "enumerator_contact" "text" NOT NULL,
    "team_leader" "text" NOT NULL,
    "location_hub" "text" NOT NULL,
    "site_name_id" "text" NOT NULL,
    "visit_date" timestamp with time zone NOT NULL,
    "visit_time" "text" NOT NULL,
    "activities_monitored" "text"[] NOT NULL,
    "activity_monitoring" "jsonb" DEFAULT '{}'::"jsonb",
    "activity_priorities" "jsonb" DEFAULT '{}'::"jsonb",
    "activity_photos" "text"[] DEFAULT '{}'::"text"[],
    "distribution_monitoring" "jsonb" DEFAULT '{}'::"jsonb",
    "distribution_photos" "text"[] DEFAULT '{}'::"text"[],
    "post_distribution_monitoring" "jsonb" DEFAULT '{}'::"jsonb",
    "post_distribution_photos" "text"[] DEFAULT '{}'::"text"[],
    "post_harvest_loss" "jsonb" DEFAULT '{}'::"jsonb",
    "post_harvest_photos" "text"[] DEFAULT '{}'::"text"[],
    "market_diversion_monitoring" "jsonb" DEFAULT '{}'::"jsonb",
    "market_diversion_photos" "text"[] DEFAULT '{}'::"text"[],
    "additional_notes" "text" DEFAULT ''::"text",
    "is_synced" boolean DEFAULT true,
    "last_modified" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comprehensive_monitoring_checklists" OWNER TO "postgres";


COMMENT ON TABLE "public"."comprehensive_monitoring_checklists" IS 'refresh-2025-11-22 18:33:24.364955+00';



COMMENT ON COLUMN "public"."comprehensive_monitoring_checklists"."activities_monitored" IS 'Array of monitored activities: AM, DM, PDM, MDM, PHL';



COMMENT ON COLUMN "public"."comprehensive_monitoring_checklists"."activity_priorities" IS 'Priority levels (Low/Med/High) for each observation';



CREATE TABLE IF NOT EXISTS "public"."cost_adjustment_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_cost_id" "uuid",
    "site_visit_id" "uuid",
    "mmp_site_entry_id" "uuid",
    "site_name" "text",
    "previous_transportation_cost" numeric(12,2),
    "previous_accommodation_cost" numeric(12,2),
    "previous_meal_allowance" numeric(12,2),
    "previous_other_costs" numeric(12,2),
    "previous_total_cost" numeric(12,2),
    "new_transportation_cost" numeric(12,2),
    "new_accommodation_cost" numeric(12,2),
    "new_meal_allowance" numeric(12,2),
    "new_other_costs" numeric(12,2),
    "new_total_cost" numeric(12,2),
    "adjustment_type" "text" NOT NULL,
    "adjustment_reason" "text" NOT NULL,
    "supporting_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "adjusted_by" "uuid" NOT NULL,
    "adjusted_by_role" "text" NOT NULL,
    "adjusted_by_name" "text",
    "adjusted_at" timestamp with time zone DEFAULT "now"(),
    "additional_payment_needed" numeric(12,2) DEFAULT 0,
    "additional_payment_transaction_id" "uuid",
    "additional_payment_processed" boolean DEFAULT false,
    "additional_payment_processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "cost_adjustment_audit_adjustment_type_check" CHECK (("adjustment_type" = ANY (ARRAY['increase'::"text", 'decrease'::"text", 'correction'::"text"])))
);


ALTER TABLE "public"."cost_adjustment_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."cost_adjustment_audit" IS 'Complete audit trail of all cost adjustments';



CREATE TABLE IF NOT EXISTS "public"."cost_approval_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid",
    "action" character varying(50) NOT NULL,
    "actor_id" "uuid",
    "actor_role" character varying(50),
    "action_timestamp" timestamp with time zone DEFAULT "now"(),
    "previous_status" character varying(20),
    "new_status" character varying(20),
    "previous_amount_cents" bigint,
    "new_amount_cents" bigint,
    "notes" "text",
    "changes" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cost_approval_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."cost_approval_history" IS 'Audit trail of all cost submission status changes and approvals';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "username" "text",
    "full_name" "text",
    "role" "text",
    "avatar_url" "text",
    "hub_id" "text",
    "state_id" "text",
    "locality_id" "text",
    "employee_id" "text",
    "phone" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "availability" "text",
    "location" "jsonb",
    "location_sharing" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bank_account" "jsonb",
    "fcm_token" "text",
    "fcm_token_updated_at" timestamp with time zone,
    "phone_verified" boolean DEFAULT false,
    "phone_verified_at" timestamp with time zone,
    "email_verified" boolean DEFAULT false,
    "email_verified_at" timestamp with time zone,
    "last_active_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."user_classifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "classification_level" "public"."classification_level" NOT NULL,
    "role_scope" "public"."classification_role_scope" NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_until" timestamp with time zone,
    "has_retainer" boolean DEFAULT false,
    "retainer_amount_cents" integer DEFAULT 0,
    "retainer_currency" "text" DEFAULT 'SDG'::"text",
    "retainer_frequency" "text" DEFAULT 'monthly'::"text",
    "assigned_by" "uuid",
    "change_reason" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_effective_dates" CHECK ((("effective_until" IS NULL) OR ("effective_until" > "effective_from"))),
    CONSTRAINT "valid_retainer_amount" CHECK (("retainer_amount_cents" >= 0))
);


ALTER TABLE "public"."user_classifications" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_user_classifications" WITH ("security_invoker"='on') AS
 SELECT DISTINCT ON ("uc"."user_id") "uc"."id",
    "uc"."user_id",
    "uc"."classification_level",
    "uc"."role_scope",
    "uc"."effective_from",
    "uc"."effective_until",
    "uc"."has_retainer",
    "uc"."retainer_amount_cents",
    "uc"."retainer_currency",
    "uc"."retainer_frequency",
    "uc"."assigned_by",
    "uc"."change_reason",
    "uc"."notes",
    "uc"."is_active",
    "uc"."created_at",
    "uc"."updated_at",
    "p"."full_name",
    "p"."email",
    "p"."role" AS "user_role"
   FROM ("public"."user_classifications" "uc"
     JOIN "public"."profiles" "p" ON (("uc"."user_id" = "p"."id")))
  WHERE (("uc"."is_active" = true) AND ("uc"."effective_from" <= "now"()) AND (("uc"."effective_until" IS NULL) OR ("uc"."effective_until" > "now"())))
  ORDER BY "uc"."user_id", "uc"."effective_from" DESC;


ALTER VIEW "public"."current_user_classifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "layout" "jsonb",
    "widget_order" "text"[],
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."dashboard_settings" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."data_visibility_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "options" "jsonb",
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."data_visibility_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."data_visibility_settings" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."deletion_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "record_data" "jsonb" NOT NULL,
    "deleted_by" "uuid" NOT NULL,
    "deleted_by_role" "text" NOT NULL,
    "deleted_by_name" "text",
    "deletion_reason" "text" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"(),
    "is_restorable" boolean DEFAULT true,
    "restored_at" timestamp with time zone,
    "restored_by" "uuid",
    "restoration_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."deletion_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."deletion_audit_log" IS 'Complete audit trail of all deletions';



CREATE TABLE IF NOT EXISTS "public"."digital_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "signature_type" "text" DEFAULT 'drawn'::"text" NOT NULL,
    "signature_data" "text" NOT NULL,
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "document_name" "text",
    "device_info" "text",
    "is_template" boolean DEFAULT false,
    "source_signature_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."digital_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."down_payment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid",
    "mmp_site_entry_id" "uuid",
    "site_name" "text",
    "requested_by" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "requester_role" "text",
    "hub_id" "text",
    "hub_name" "text",
    "total_transportation_budget" numeric(12,2) NOT NULL,
    "requested_amount" numeric(12,2) NOT NULL,
    "payment_type" "text" NOT NULL,
    "installment_plan" "jsonb" DEFAULT '[]'::"jsonb",
    "paid_installments" "jsonb" DEFAULT '[]'::"jsonb",
    "justification" "text" NOT NULL,
    "supporting_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "supervisor_id" "uuid",
    "supervisor_status" "text",
    "supervisor_approved_by" "uuid",
    "supervisor_approved_at" timestamp with time zone,
    "supervisor_notes" "text",
    "supervisor_rejection_reason" "text",
    "admin_status" "text",
    "admin_processed_by" "uuid",
    "admin_processed_at" timestamp with time zone,
    "admin_notes" "text",
    "admin_rejection_reason" "text",
    "status" "text" DEFAULT 'pending_supervisor'::"text" NOT NULL,
    "total_paid_amount" numeric(12,2) DEFAULT 0,
    "remaining_amount" numeric(12,2),
    "wallet_transaction_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "down_payment_requests_admin_status_check" CHECK (("admin_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "down_payment_requests_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['full_advance'::"text", 'installments'::"text"]))),
    CONSTRAINT "down_payment_requests_status_check" CHECK (("status" = ANY (ARRAY['pending_supervisor'::"text", 'pending_admin'::"text", 'approved'::"text", 'rejected'::"text", 'partially_paid'::"text", 'fully_paid'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "down_payment_requests_supervisor_status_check" CHECK (("supervisor_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'changes_requested'::"text"])))
);


ALTER TABLE "public"."down_payment_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."down_payment_requests" IS 'Tracks down-payment requests with two-tier approval workflow';



COMMENT ON COLUMN "public"."down_payment_requests"."hub_id" IS 'Hub identifier (TEXT to match profiles.hub_id)';



CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "status" "text",
    "location" "text",
    "last_inspection" timestamp without time zone,
    "next_inspection" timestamp without time zone,
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


COMMENT ON TABLE "public"."equipment" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text",
    "user_name" "text",
    "page_url" "text",
    "page_name" "text",
    "reaction" "text",
    "feedback_text" "text",
    "category" "text" DEFAULT 'general'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'new'::"text",
    "assigned_to" "uuid",
    "internal_notes" "text",
    "browser_info" "jsonb",
    "device_info" "jsonb",
    "session_info" "jsonb",
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid"
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."feedback" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."handwriting_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "signature_image" "text" NOT NULL,
    "signature_type" character varying DEFAULT 'drawn'::character varying NOT NULL,
    "canvas_width" integer,
    "canvas_height" integer,
    "stroke_count" integer,
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."handwriting_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historical_site_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" character varying(255) NOT NULL,
    "site_name" character varying(500),
    "state_id" character varying(255),
    "locality_id" character varying(255),
    "hub_id" character varying(255),
    "visit_date" "date",
    "actual_cost" numeric(12,2) NOT NULL,
    "transport_mode" character varying(255),
    "gps_latitude" numeric(10,8),
    "gps_longitude" numeric(11,8),
    "gps_source" character varying(50),
    "data_collector_id" "uuid",
    "collector_distance_km" numeric(8,2),
    "mmp_id" "uuid",
    "source" character varying(50) DEFAULT 'historical_upload'::character varying,
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historical_site_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_states" (
    "id" integer NOT NULL,
    "hub_id" "text" NOT NULL,
    "state_id" "text" NOT NULL,
    "state_name" character varying(100) NOT NULL,
    "state_code" character varying(5) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hub_states" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."hub_states_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."hub_states_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."hub_states_id_seq" OWNED BY "public"."hub_states"."id";



CREATE TABLE IF NOT EXISTS "public"."hubs" (
    "id" "text" NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "coordinates" "jsonb" DEFAULT '{"latitude": 0, "longitude": 0}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text"
);


ALTER TABLE "public"."hubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "latitude" double precision,
    "longitude" double precision,
    "reported_by" "uuid",
    "status" "text",
    "severity" "text",
    "date_reported" timestamp without time zone DEFAULT "now"(),
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid"
);


ALTER TABLE "public"."incident_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."incident_reports" IS 'refresh-2025-11-22 18:33:24.364955+00';



COMMENT ON COLUMN "public"."incident_reports"."user_id" IS 'ID of the user who reported this incident';



CREATE TABLE IF NOT EXISTS "public"."location_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "timestamp" timestamp without time zone DEFAULT "now"(),
    "accuracy" double precision,
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"(),
    "altitude" double precision,
    "speed" double precision,
    "heading" double precision,
    "user_id" "uuid",
    "visit_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."location_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."location_logs" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."mmp_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mmp_file_id" "uuid" NOT NULL,
    "project_budget_id" "uuid",
    "allocated_budget_cents" bigint DEFAULT 0 NOT NULL,
    "spent_budget_cents" bigint DEFAULT 0 NOT NULL,
    "remaining_budget_cents" bigint DEFAULT 0 NOT NULL,
    "total_sites" integer DEFAULT 0,
    "budgeted_sites" integer DEFAULT 0,
    "completed_sites" integer DEFAULT 0,
    "average_cost_per_site_cents" bigint DEFAULT 0,
    "category_breakdown" "jsonb" DEFAULT '{"meals": 0, "other": 0, "accommodation": 0, "transportation": 0, "site_visit_fees": 0}'::"jsonb",
    "source_type" character varying(50) DEFAULT 'project_allocation'::character varying,
    "parent_budget_id" "uuid",
    "status" character varying(50) DEFAULT 'active'::character varying,
    "budget_notes" "text",
    "allocated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mmp_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mmp_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "uploaded_at" timestamp with time zone,
    "status" "text",
    "entries" integer,
    "processed_entries" integer,
    "mmp_id" "text",
    "version" "jsonb",
    "site_entries" "jsonb",
    "workflow" "jsonb",
    "project_id" "uuid",
    "file_path" "text",
    "original_filename" "text",
    "file_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approved_by" "text",
    "approved_at" timestamp with time zone,
    "verified_by" "text",
    "verified_at" timestamp with time zone,
    "activities" "jsonb",
    "permits" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cp_verification" "jsonb",
    "archivedby" "text",
    "archivedat" timestamp with time zone,
    "approvedby" "text",
    "approvedat" timestamp with time zone,
    "rejectionreason" "text",
    "uploaded_by" "text",
    "hub" "text",
    "month" "text",
    "cycle_status" "text" DEFAULT 'active'::"text",
    "cycle_closed_at" timestamp with time zone,
    "cycle_closed_by" "uuid",
    "cycle_closing_started_at" timestamp with time zone,
    "cycle_closing_started_by" "uuid",
    CONSTRAINT "mmp_files_cycle_status_check" CHECK (("cycle_status" = ANY (ARRAY['active'::"text", 'closing'::"text", 'closed'::"text"])))
);

ALTER TABLE ONLY "public"."mmp_files" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."mmp_files" OWNER TO "postgres";


COMMENT ON TABLE "public"."mmp_files" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."mmp_site_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mmp_file_id" "uuid" NOT NULL,
    "site_code" "text",
    "hub_office" "text",
    "state" "text",
    "locality" "text",
    "site_name" "text",
    "cp_name" "text",
    "visit_type" "text",
    "visit_date" "text",
    "main_activity" "text",
    "activity_at_site" "text",
    "monitoring_by" "text",
    "survey_tool" "text",
    "use_market_diversion" boolean,
    "use_warehouse_monitoring" boolean,
    "comments" "text",
    "additional_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'Pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cost" numeric,
    "verification_notes" "text",
    "verified_by" "text",
    "verified_at" timestamp with time zone,
    "dispatched_by" "text",
    "dispatched_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "enumerator_fee" numeric,
    "transport_fee" numeric,
    "accepted_by" "text",
    "accepted_at" timestamp with time zone,
    "verified_by_user_id" "uuid",
    "completed_by_user_id" "uuid",
    "forwarded_by_user_id" "uuid",
    "forwarded_to_user_id" "uuid",
    "forwarded_at" timestamp with time zone,
    "cost_acknowledged" boolean DEFAULT false,
    "cost_acknowledged_at" timestamp with time zone,
    "cost_acknowledged_by" "uuid",
    "rejection_comments" "text",
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "claimed_at" timestamp with time zone,
    "claimed_by" "uuid",
    "registry_site_id" "text",
    "visit_started_at" timestamp with time zone,
    "visit_started_by" "uuid",
    "visit_completed_at" timestamp with time zone,
    "visit_completed_by" "uuid"
);

ALTER TABLE ONLY "public"."mmp_site_entries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."mmp_site_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."mmp_site_entries" IS 'refresh-2025-11-22 18:33:24.364955+00';



COMMENT ON COLUMN "public"."mmp_site_entries"."verified_by" IS 'Username or identifier of the user who verified this site entry';



COMMENT ON COLUMN "public"."mmp_site_entries"."verified_at" IS 'Timestamp when the site entry was verified';



COMMENT ON COLUMN "public"."mmp_site_entries"."dispatched_by" IS 'Username or identifier of the user who dispatched this site entry';



COMMENT ON COLUMN "public"."mmp_site_entries"."dispatched_at" IS 'Timestamp when the site entry was dispatched to data collectors';



COMMENT ON COLUMN "public"."mmp_site_entries"."updated_at" IS 'Timestamp when the site entry was last updated (automatically maintained)';



COMMENT ON COLUMN "public"."mmp_site_entries"."accepted_by" IS 'User ID or identifier of the data collector who accepted this site entry (one entry, one data collector)';



COMMENT ON COLUMN "public"."mmp_site_entries"."accepted_at" IS 'Timestamp when the site entry was accepted by a data collector';



COMMENT ON COLUMN "public"."mmp_site_entries"."verified_by_user_id" IS 'Foreign key to profiles.id - The user who verified this site entry. Use this for proper relational queries.';



COMMENT ON COLUMN "public"."mmp_site_entries"."completed_by_user_id" IS 'Foreign key to profiles.id - The user who completed/accepted this site entry. Use this for proper relational queries.';



COMMENT ON COLUMN "public"."mmp_site_entries"."forwarded_by_user_id" IS 'Foreign key to profiles.id - The user who forwarded this site entry to a coordinator. Use this for proper relational queries.';



COMMENT ON COLUMN "public"."mmp_site_entries"."forwarded_to_user_id" IS 'Foreign key to profiles.id - The coordinator user this site entry was forwarded to. Use this for proper relational queries.';



COMMENT ON COLUMN "public"."mmp_site_entries"."forwarded_at" IS 'Timestamp when the site entry was forwarded to a coordinator. NULL means not yet forwarded.';



COMMENT ON COLUMN "public"."mmp_site_entries"."cost_acknowledged" IS 'Indicates if the cost has been acknowledged by the relevant party';



COMMENT ON COLUMN "public"."mmp_site_entries"."cost_acknowledged_at" IS 'Timestamp when the cost was acknowledged';



COMMENT ON COLUMN "public"."mmp_site_entries"."cost_acknowledged_by" IS 'User who acknowledged the cost';



COMMENT ON COLUMN "public"."mmp_site_entries"."rejection_comments" IS 'Comments explaining why the site was sent back to coordinator';



COMMENT ON COLUMN "public"."mmp_site_entries"."rejected_by" IS 'User ID of the enumerator/data collector who sent the site back';



COMMENT ON COLUMN "public"."mmp_site_entries"."rejected_at" IS 'Timestamp when the site was sent back to coordinator';



COMMENT ON COLUMN "public"."mmp_site_entries"."claimed_at" IS 'Timestamp when the site was claimed by an enumerator';



COMMENT ON COLUMN "public"."mmp_site_entries"."claimed_by" IS 'User ID of the enumerator who claimed this site';



COMMENT ON COLUMN "public"."mmp_site_entries"."registry_site_id" IS 'Foreign key reference to sites_registry.id for unified site management';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "recipient_id" "uuid",
    "recipient_email" "text",
    "recipient_role" "text",
    "title_en" "text" NOT NULL,
    "title_ar" "text",
    "message_en" "text" NOT NULL,
    "message_ar" "text",
    "triggered_by" "uuid",
    "triggered_by_name" "text",
    "workflow_stage" "text",
    "action_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "email_sent" boolean DEFAULT false,
    "email_sent_at" timestamp with time zone,
    "email_error" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "type" "text",
    "title" "text",
    "message" "text",
    "link" "text",
    "related_entity_id" "text",
    "related_entity_type" "text"
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "otp" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."password_reset_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "account_number" "text",
    "bank_name" "text",
    "phone_number" "text",
    "card_number" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_methods_type_check" CHECK (("type" = ANY (ARRAY['bank'::"text", 'mobile_money'::"text", 'card'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "method" "public"."payout_method" NOT NULL,
    "destination" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "public"."payout_status" DEFAULT 'requested'::"public"."payout_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "paid_at" timestamp with time zone,
    "wallet_id" "uuid",
    "currency" "text" DEFAULT 'SDG'::"text",
    "request_reason" "text",
    "supervisor_id" "uuid",
    "supervisor_notes" "text",
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "payment_method" "text",
    "payment_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payout_requests_amount_cents_check" CHECK (("amount_cents" > 0))
);


ALTER TABLE "public"."payout_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."payout_requests" IS 'User requests to withdraw money from their wallet (alternative to withdrawal_requests)';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "project_code" "text",
    "description" "text",
    "project_type" "text",
    "status" "text",
    "start_date" "date",
    "end_date" "date",
    "budget" "jsonb",
    "location" "jsonb",
    "team" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."projects" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."site_visit_cost_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid",
    "mmp_file_id" "uuid",
    "project_id" "uuid",
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "transportation_cost_cents" bigint DEFAULT 0 NOT NULL,
    "accommodation_cost_cents" bigint DEFAULT 0 NOT NULL,
    "meal_allowance_cents" bigint DEFAULT 0 NOT NULL,
    "other_costs_cents" bigint DEFAULT 0 NOT NULL,
    "total_cost_cents" bigint DEFAULT 0 NOT NULL,
    "currency" character varying(3) DEFAULT 'SDG'::character varying NOT NULL,
    "transportation_details" "text",
    "accommodation_details" "text",
    "meal_details" "text",
    "other_details" "text",
    "submission_notes" "text",
    "supporting_documents" "jsonb" DEFAULT '[]'::"jsonb",
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "reviewer_notes" "text",
    "approval_notes" "text",
    "wallet_transaction_id" "uuid",
    "paid_at" timestamp with time zone,
    "paid_amount_cents" bigint,
    "payment_notes" "text",
    "classification_level" character varying(1),
    "role_scope" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "positive_costs" CHECK ((("transportation_cost_cents" >= 0) AND ("accommodation_cost_cents" >= 0) AND ("meal_allowance_cents" >= 0) AND ("other_costs_cents" >= 0) AND ("total_cost_cents" >= 0))),
    CONSTRAINT "valid_currency" CHECK ((("currency")::"text" = ANY ((ARRAY['SDG'::character varying, 'USD'::character varying, 'EUR'::character varying, 'GBP'::character varying, 'SAR'::character varying, 'AED'::character varying])::"text"[]))),
    CONSTRAINT "valid_status" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'under_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'paid'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."site_visit_cost_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_visit_cost_submissions" IS 'Actual cost submissions by field staff for site visits requiring approval';



CREATE TABLE IF NOT EXISTS "public"."site_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_name" "text",
    "site_code" "text",
    "locality" "text",
    "state" "text",
    "hub" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "assigned_to" "uuid",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone,
    "due_date" timestamp with time zone,
    "scheduled_date" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "mmp_id" "text",
    "mmp_file_id" "uuid",
    "mmp_site_entry_id" "uuid",
    "main_activity" "text",
    "activity" "text",
    "project_activities" "text"[],
    "visit_type" "text",
    "monitoring_type" "text",
    "complexity" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "location" "jsonb" DEFAULT '{}'::"jsonb",
    "coordinates" "jsonb" DEFAULT '{}'::"jsonb",
    "fees" "jsonb" DEFAULT '{}'::"jsonb",
    "cost" numeric,
    "enumerator_fee" numeric,
    "transport_fee" numeric,
    "permit_details" "jsonb" DEFAULT '{}'::"jsonb",
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "not_covered_flag" boolean DEFAULT false,
    "not_covered_reason" "text",
    "not_covered_reason_other" "text",
    "not_covered_at" timestamp with time zone,
    "not_covered_by" "uuid",
    CONSTRAINT "site_visits_not_covered_reason_check" CHECK (("not_covered_reason" = ANY (ARRAY['not_distributed'::"text", 'cp_not_confirmed'::"text", 'security_concerns'::"text", 'access_denied'::"text", 'staff_unavailable'::"text", 'weather_disaster'::"text", 'budget_constraints'::"text", 'time_constraints'::"text", 'duplicate_site'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."site_visits" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pending_cost_approvals" WITH ("security_invoker"='on') AS
 SELECT "cs"."id",
    "cs"."site_visit_id",
    "cs"."mmp_file_id",
    "cs"."project_id",
    "cs"."submitted_by",
    "cs"."submitted_at",
    "cs"."transportation_cost_cents",
    "cs"."accommodation_cost_cents",
    "cs"."meal_allowance_cents",
    "cs"."other_costs_cents",
    "cs"."total_cost_cents",
    "cs"."currency",
    "cs"."transportation_details",
    "cs"."accommodation_details",
    "cs"."meal_details",
    "cs"."other_details",
    "cs"."submission_notes",
    "cs"."supporting_documents",
    "cs"."status",
    "cs"."reviewed_by",
    "cs"."reviewed_at",
    "cs"."reviewer_notes",
    "cs"."approval_notes",
    "cs"."wallet_transaction_id",
    "cs"."paid_at",
    "cs"."paid_amount_cents",
    "cs"."payment_notes",
    "cs"."classification_level",
    "cs"."role_scope",
    "cs"."created_at",
    "cs"."updated_at",
    "p"."full_name" AS "submitter_name",
    "p"."email" AS "submitter_email",
    "sv"."site_name",
    "sv"."status" AS "site_visit_status",
    "mf"."name" AS "mmp_name",
    "proj"."name" AS "project_name",
    EXTRACT(day FROM ("now"() - "cs"."submitted_at")) AS "days_pending"
   FROM (((("public"."site_visit_cost_submissions" "cs"
     LEFT JOIN "public"."profiles" "p" ON (("cs"."submitted_by" = "p"."id")))
     LEFT JOIN "public"."site_visits" "sv" ON (("cs"."site_visit_id" = "sv"."id")))
     LEFT JOIN "public"."mmp_files" "mf" ON (("cs"."mmp_file_id" = "mf"."id")))
     LEFT JOIN "public"."projects" "proj" ON (("cs"."project_id" = "proj"."id")))
  WHERE (("cs"."status")::"text" = ANY ((ARRAY['pending'::character varying, 'under_review'::character varying])::"text"[]))
  ORDER BY "cs"."submitted_at";


ALTER VIEW "public"."pending_cost_approvals" OWNER TO "postgres";


COMMENT ON VIEW "public"."pending_cost_approvals" IS 'Helper view for finance/admin to see all pending cost approvals with submitter details';



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid",
    "resource" character varying(50) NOT NULL,
    "action" character varying(50) NOT NULL,
    "conditions" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "permissions_action_check" CHECK ((("action")::"text" = ANY (ARRAY['create'::"text", 'read'::"text", 'update'::"text", 'delete'::"text", 'approve'::"text", 'assign'::"text"]))),
    CONSTRAINT "permissions_resource_check" CHECK ((("resource")::"text" = ANY (ARRAY['users'::"text", 'roles'::"text", 'permissions'::"text", 'projects'::"text", 'mmp'::"text", 'site_visits'::"text", 'finances'::"text", 'reports'::"text", 'settings'::"text"])))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."permissions" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."project_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "name" "text",
    "description" "text",
    "start_date" "date",
    "end_date" "date",
    "status" "text",
    "is_active" boolean DEFAULT true,
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_activities" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."project_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "total_budget_cents" bigint DEFAULT 0 NOT NULL,
    "allocated_budget_cents" bigint DEFAULT 0 NOT NULL,
    "spent_budget_cents" bigint DEFAULT 0 NOT NULL,
    "remaining_budget_cents" bigint DEFAULT 0 NOT NULL,
    "budget_period" character varying(50) NOT NULL,
    "period_start_date" "date",
    "period_end_date" "date",
    "category_allocations" "jsonb" DEFAULT '{"meals": 0, "other": 0, "equipment": 0, "site_visits": 0, "accommodation": 0, "transportation": 0}'::"jsonb",
    "status" character varying(50) DEFAULT 'draft'::character varying,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "fiscal_year" integer,
    "budget_notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_scopes" (
    "id" "text" NOT NULL,
    "project_id" "uuid",
    "hub_id" "text",
    "states" "text"[] DEFAULT '{}'::"text"[],
    "localities" "jsonb" DEFAULT '{}'::"jsonb",
    "site_ids" "text"[] DEFAULT '{}'::"text"[],
    "scope_type" character varying(20) DEFAULT 'hub'::character varying,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text"
);


ALTER TABLE "public"."project_scopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid",
    "photo_url" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "deleted_at" timestamp without time zone,
    "storage_path" "text",
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_photos" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_photos" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid",
    "notes" "text" NOT NULL,
    "submitted_at" timestamp without time zone DEFAULT "now"(),
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"(),
    "activities" "text",
    "duration_minutes" integer,
    "coordinates" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "submitted_by" "uuid",
    CONSTRAINT "reports_coordinates_shape_chk" CHECK ((("coordinates" = '{}'::"jsonb") OR (("jsonb_typeof"("coordinates") = 'object'::"text") AND ("coordinates" ? 'latitude'::"text") AND ("coordinates" ? 'longitude'::"text"))))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."reports" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "description" "text",
    "is_system_role" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."safety_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "items" "jsonb",
    "completed_by" "uuid",
    "site_visit_id" "uuid",
    "completed_at" timestamp without time zone,
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."safety_checklists" OWNER TO "postgres";


COMMENT ON TABLE "public"."safety_checklists" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."site_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" double precision,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "geom" "public"."geography"(Point,4326) GENERATED ALWAYS AS (
CASE
    WHEN (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL)) THEN ("public"."st_setsrid"("public"."st_makepoint"("longitude", "latitude"), 4326))::"public"."geography"
    ELSE NULL::"public"."geography"
END) STORED
);


ALTER TABLE "public"."site_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_locations" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."site_visit_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid" NOT NULL,
    "transportation_cost" numeric DEFAULT 0 NOT NULL,
    "accommodation_cost" numeric DEFAULT 0 NOT NULL,
    "meal_allowance" numeric DEFAULT 0 NOT NULL,
    "other_costs" numeric DEFAULT 0 NOT NULL,
    "total_cost" numeric GENERATED ALWAYS AS (((("transportation_cost" + "accommodation_cost") + "meal_allowance") + "other_costs")) STORED,
    "currency" "text" DEFAULT 'SDG'::"text" NOT NULL,
    "assigned_by" "uuid",
    "adjusted_by" "uuid",
    "adjustment_reason" "text",
    "cost_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost_status" "text" DEFAULT 'estimated'::"text",
    "calculated_by" "uuid",
    "calculation_notes" "text",
    CONSTRAINT "site_visit_costs_accommodation_cost_check" CHECK (("accommodation_cost" >= (0)::numeric)),
    CONSTRAINT "site_visit_costs_meal_allowance_check" CHECK (("meal_allowance" >= (0)::numeric)),
    CONSTRAINT "site_visit_costs_other_costs_check" CHECK (("other_costs" >= (0)::numeric)),
    CONSTRAINT "site_visit_costs_transportation_cost_check" CHECK (("transportation_cost" >= (0)::numeric))
);


ALTER TABLE "public"."site_visit_costs" OWNER TO "postgres";


COMMENT ON TABLE "public"."site_visit_costs" IS 'Cost breakdown for site visits (transportation, accommodation, meals, etc.)';



COMMENT ON COLUMN "public"."site_visit_costs"."cost_status" IS 'Status of cost record: estimated | finalized | adjusted';



COMMENT ON COLUMN "public"."site_visit_costs"."calculated_by" IS 'Admin who calculated the estimated costs';



COMMENT ON COLUMN "public"."site_visit_costs"."calculation_notes" IS 'Notes about how costs were calculated';



CREATE TABLE IF NOT EXISTS "public"."sites_registry" (
    "id" "text" NOT NULL,
    "site_code" character varying(50) NOT NULL,
    "site_name" character varying(200) NOT NULL,
    "state_id" "text" NOT NULL,
    "state_name" character varying(100) NOT NULL,
    "locality_id" "text" NOT NULL,
    "locality_name" character varying(100) NOT NULL,
    "hub_id" "text",
    "hub_name" character varying(100),
    "gps_latitude" numeric(10,6),
    "gps_longitude" numeric(10,6),
    "activity_type" character varying(20) DEFAULT 'TPM'::character varying NOT NULL,
    "status" character varying(20) DEFAULT 'registered'::character varying,
    "mmp_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "residence_latitude" numeric,
    "residence_longitude" numeric,
    "residence_altitude" numeric,
    "residence_precision" numeric,
    "gps_altitude" numeric,
    "gps_precision" numeric,
    "cp_name" character varying,
    "tool_type" character varying
);


ALTER TABLE "public"."sites_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid",
    "name" "text",
    "description" "text",
    "status" "text",
    "is_active" boolean DEFAULT true,
    "due_date" "date",
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sub_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."sub_activities" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."super_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "appointed_by" "uuid",
    "appointed_at" timestamp with time zone DEFAULT "now"(),
    "appointment_reason" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "deactivated_at" timestamp with time zone,
    "deactivated_by" "uuid",
    "deactivation_reason" "text",
    "last_activity_at" timestamp with time zone,
    "deletion_count" integer DEFAULT 0,
    "adjustment_count" integer DEFAULT 0,
    "total_actions_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."super_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."super_admins" IS 'Super-admin role - Maximum 3 active accounts allowed';



CREATE TABLE IF NOT EXISTS "public"."support_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text",
    "role" "text",
    "role_ar" "text",
    "email" "text",
    "phone" "text",
    "whatsapp" "text",
    "avatar_url" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."support_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "source" "text" DEFAULT 'mobile'::"text" NOT NULL,
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "support_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "support_tickets_source_check" CHECK (("source" = ANY (ARRAY['mobile'::"text", 'web'::"text"]))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'waiting'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_budget_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_budget_id" "uuid" NOT NULL,
    "transaction_type" character varying NOT NULL,
    "amount_cents" bigint NOT NULL,
    "category" character varying,
    "description" "text",
    "reference_id" character varying,
    "balance_before_cents" bigint,
    "balance_after_cents" bigint,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_budget_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" character varying NOT NULL,
    "task_name" character varying NOT NULL,
    "project_id" "uuid" NOT NULL,
    "mmp_file_id" "uuid",
    "allocated_budget_cents" bigint DEFAULT 0 NOT NULL,
    "spent_budget_cents" bigint DEFAULT 0 NOT NULL,
    "remaining_budget_cents" bigint DEFAULT 0 NOT NULL,
    "planned_start_date" "date",
    "planned_end_date" "date",
    "actual_start_date" "date",
    "actual_end_date" "date",
    "estimated_hours" integer,
    "actual_hours" integer,
    "category_breakdown" "jsonb" DEFAULT '{"labor": 0, "other": 0, "materials": 0, "transportation": 0}'::"jsonb",
    "variance" "jsonb",
    "status" character varying DEFAULT 'draft'::character varying NOT NULL,
    "priority" character varying DEFAULT 'medium'::character varying NOT NULL,
    "assigned_to" "uuid",
    "created_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "budget_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "project_id" "uuid",
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_name" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role_id" "uuid",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'offline'::"text",
    CONSTRAINT "user_roles_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'fom'::"text", 'financialAdmin'::"text", 'supervisor'::"text", 'coordinator'::"text", 'dataCollector'::"text", 'reviewer'::"text"])))),
    CONSTRAINT "user_roles_role_xor_check" CHECK ((((("role" IS NOT NULL))::integer + (("role_id" IS NOT NULL))::integer) = 1)),
    CONSTRAINT "user_roles_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'refresh-2025-11-22 18:33:24.364955+00';



COMMENT ON COLUMN "public"."user_roles"."status" IS 'Current online/offline status of the user';



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "settings" "jsonb",
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_settings" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."user_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "signature_data" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_rejections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visit_rejections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_visit_id" "uuid",
    "status" "text" NOT NULL,
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "is_synced" boolean DEFAULT false,
    "last_modified" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."visit_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."visit_status" IS 'refresh-2025-11-22 18:33:24.364955+00';



CREATE TABLE IF NOT EXISTS "public"."wallet_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "currency" character varying(3) DEFAULT 'SDG'::character varying,
    "status" character varying(50) DEFAULT 'active'::character varying,
    "last_transaction_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wallet_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "notification_prefs" "jsonb",
    "auto_withdraw" boolean DEFAULT false,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wallet_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_settings" IS 'User preferences for wallet notifications and auto-withdraw settings';



CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'SDG'::"text" NOT NULL,
    "type" "public"."wallet_tx_type" NOT NULL,
    "status" "public"."wallet_tx_status" DEFAULT 'pending'::"public"."wallet_tx_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "posted_at" timestamp with time zone,
    "memo" "text",
    "related_site_visit_id" "uuid",
    "visit_code" "text",
    "wallet_id" "uuid",
    "amount" numeric,
    "site_visit_id" "uuid",
    "withdrawal_request_id" "uuid",
    "description" "text",
    "metadata" "jsonb",
    "balance_before" numeric,
    "balance_after" numeric,
    "created_by" "uuid",
    CONSTRAINT "wallet_transactions_amount_cents_check" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_transactions" IS 'All wallet transactions including earnings, withdrawals, and adjustments';



CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'SDG'::"text" NOT NULL,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "total_earned_cents" bigint DEFAULT 0 NOT NULL,
    "total_paid_out_cents" bigint DEFAULT 0 NOT NULL,
    "pending_payout_cents" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "balances" "jsonb" DEFAULT '{"SDG": 0}'::"jsonb",
    "total_earned" numeric DEFAULT 0,
    "total_withdrawn" numeric DEFAULT 0
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallets" IS 'Main wallet table storing user balances and financial totals';



CREATE TABLE IF NOT EXISTS "public"."wallets_backup" (
    "id" "uuid",
    "user_id" "uuid",
    "currency" "text",
    "balance_cents" bigint,
    "total_earned_cents" bigint,
    "total_paid_out_cents" bigint,
    "pending_payout_cents" bigint,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "balances" "jsonb",
    "total_earned" numeric,
    "total_withdrawn" numeric
);


ALTER TABLE "public"."wallets_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withdrawal_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'SDG'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_reason" "text",
    "supervisor_id" "uuid",
    "supervisor_notes" "text",
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "payment_method" "text",
    "payment_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_notes" "text",
    "admin_processed_by" "uuid",
    "admin_processed_at" timestamp with time zone,
    CONSTRAINT "withdrawal_requests_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "withdrawal_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'supervisor_approved'::"text", 'processing'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."withdrawal_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."withdrawal_requests" IS 'User requests to withdraw money from their wallet (primary table used by WalletContext)';



ALTER TABLE ONLY "public"."app_versions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."app_versions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."hub_states" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."hub_states_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_history"
    ADD CONSTRAINT "call_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("chat_id", "user_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classification_fee_structures"
    ADD CONSTRAINT "classification_fee_structures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comprehensive_monitoring_checklists"
    ADD CONSTRAINT "comprehensive_monitoring_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_adjustment_audit"
    ADD CONSTRAINT "cost_adjustment_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_approval_history"
    ADD CONSTRAINT "cost_approval_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_visibility_settings"
    ADD CONSTRAINT "data_visibility_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deletion_audit_log"
    ADD CONSTRAINT "deletion_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digital_signatures"
    ADD CONSTRAINT "digital_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."down_payment_requests"
    ADD CONSTRAINT "down_payment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handwriting_signatures"
    ADD CONSTRAINT "handwriting_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_site_costs"
    ADD CONSTRAINT "historical_site_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_states"
    ADD CONSTRAINT "hub_states_hub_id_state_id_key" UNIQUE ("hub_id", "state_id");



ALTER TABLE ONLY "public"."hub_states"
    ADD CONSTRAINT "hub_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hubs"
    ADD CONSTRAINT "hubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_reports"
    ADD CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_logs"
    ADD CONSTRAINT "location_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmp_budgets"
    ADD CONSTRAINT "mmp_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmp_files"
    ADD CONSTRAINT "mmp_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_is_default_key" UNIQUE ("user_id", "is_default") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_role_id_resource_action_key" UNIQUE ("role_id", "resource", "action");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_activities"
    ADD CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_budgets"
    ADD CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_scopes"
    ADD CONSTRAINT "project_scopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_photos"
    ADD CONSTRAINT "report_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."safety_checklists"
    ADD CONSTRAINT "safety_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_locations"
    ADD CONSTRAINT "site_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visit_cost_submissions"
    ADD CONSTRAINT "site_visit_cost_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_site_visit_id_key" UNIQUE ("site_visit_id");



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sites_registry"
    ADD CONSTRAINT "sites_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sites_registry"
    ADD CONSTRAINT "sites_registry_site_code_key" UNIQUE ("site_code");



ALTER TABLE ONLY "public"."sub_activities"
    ADD CONSTRAINT "sub_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."support_contacts"
    ADD CONSTRAINT "support_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_budget_transactions"
    ADD CONSTRAINT "task_budget_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_budgets"
    ADD CONSTRAINT "task_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_project_id_key" UNIQUE ("user_id", "project_id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_locations"
    ADD CONSTRAINT "unique_site_actual_location" UNIQUE ("site_id");



ALTER TABLE ONLY "public"."user_classifications"
    ADD CONSTRAINT "user_classifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_signatures"
    ADD CONSTRAINT "user_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_rejections"
    ADD CONSTRAINT "visit_rejections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_status"
    ADD CONSTRAINT "visit_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_balances"
    ADD CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_balances"
    ADD CONSTRAINT "wallet_balances_user_id_currency_key" UNIQUE ("user_id", "currency");



ALTER TABLE ONLY "public"."wallet_settings"
    ADD CONSTRAINT "wallet_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "chat_messages_chat_id_created_at_idx" ON "public"."chat_messages" USING "btree" ("chat_id", "created_at");



CREATE INDEX "chat_messages_sender_id_idx" ON "public"."chat_messages" USING "btree" ("sender_id");



CREATE INDEX "chat_participants_user_id_idx" ON "public"."chat_participants" USING "btree" ("user_id");



CREATE UNIQUE INDEX "chats_unique_private_pair" ON "public"."chats" USING "btree" ("pair_key") WHERE ("type" = 'private'::"text");



CREATE INDEX "deletion_audit_log_deleted_at_idx" ON "public"."deletion_audit_log" USING "btree" ("deleted_at");



CREATE INDEX "down_payment_requests_created_at_idx" ON "public"."down_payment_requests" USING "btree" ("created_at");



CREATE UNIQUE INDEX "idx_app_versions_platform" ON "public"."app_versions" USING "btree" ("platform");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_actor_id" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_logs_entity_type" ON "public"."audit_logs" USING "btree" ("entity_type");



CREATE INDEX "idx_audit_logs_module" ON "public"."audit_logs" USING "btree" ("module");



CREATE INDEX "idx_audit_logs_success" ON "public"."audit_logs" USING "btree" ("success");



CREATE INDEX "idx_audit_logs_timestamp" ON "public"."audit_logs" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_budget_alerts_mmp" ON "public"."budget_alerts" USING "btree" ("mmp_budget_id");



CREATE INDEX "idx_budget_alerts_project" ON "public"."budget_alerts" USING "btree" ("project_budget_id");



CREATE INDEX "idx_budget_alerts_project_budget_id" ON "public"."budget_alerts" USING "btree" ("project_budget_id");



CREATE INDEX "idx_budget_alerts_severity" ON "public"."budget_alerts" USING "btree" ("severity");



CREATE INDEX "idx_budget_alerts_status" ON "public"."budget_alerts" USING "btree" ("status");



CREATE INDEX "idx_budget_transactions_created_at" ON "public"."budget_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_budget_transactions_mmp_budget" ON "public"."budget_transactions" USING "btree" ("mmp_budget_id");



CREATE INDEX "idx_budget_transactions_project_budget" ON "public"."budget_transactions" USING "btree" ("project_budget_id");



CREATE INDEX "idx_budget_transactions_project_budget_id" ON "public"."budget_transactions" USING "btree" ("project_budget_id");



CREATE INDEX "idx_budget_transactions_site_visit" ON "public"."budget_transactions" USING "btree" ("site_visit_id");



CREATE INDEX "idx_budget_transactions_type" ON "public"."budget_transactions" USING "btree" ("transaction_type");



CREATE INDEX "idx_call_history_callee_id" ON "public"."call_history" USING "btree" ("callee_id");



CREATE INDEX "idx_call_history_caller_id" ON "public"."call_history" USING "btree" ("caller_id");



CREATE INDEX "idx_call_history_created_at" ON "public"."call_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_call_logs_callee" ON "public"."call_logs" USING "btree" ("callee_id");



CREATE INDEX "idx_call_logs_caller" ON "public"."call_logs" USING "btree" ("caller_id");



CREATE INDEX "idx_call_logs_started_at" ON "public"."call_logs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_chat_messages_chat_id" ON "public"."chat_messages" USING "btree" ("chat_id");



CREATE INDEX "idx_chat_participants_user_chat" ON "public"."chat_participants" USING "btree" ("user_id", "chat_id");



CREATE INDEX "idx_comprehensive_monitoring_created_at" ON "public"."comprehensive_monitoring_checklists" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_comprehensive_monitoring_user_id" ON "public"."comprehensive_monitoring_checklists" USING "btree" ("user_id");



CREATE INDEX "idx_comprehensive_monitoring_visit_date" ON "public"."comprehensive_monitoring_checklists" USING "btree" ("visit_date" DESC);



CREATE INDEX "idx_cost_adjustment_audit_adjusted_by" ON "public"."cost_adjustment_audit" USING "btree" ("adjusted_by");



CREATE INDEX "idx_cost_adjustment_audit_site_visit_cost" ON "public"."cost_adjustment_audit" USING "btree" ("site_visit_cost_id");



CREATE INDEX "idx_cost_history_action" ON "public"."cost_approval_history" USING "btree" ("action");



CREATE INDEX "idx_cost_history_actor" ON "public"."cost_approval_history" USING "btree" ("actor_id");



CREATE INDEX "idx_cost_history_submission" ON "public"."cost_approval_history" USING "btree" ("submission_id");



CREATE INDEX "idx_cost_history_timestamp" ON "public"."cost_approval_history" USING "btree" ("action_timestamp" DESC);



CREATE INDEX "idx_cost_submissions_created_at" ON "public"."site_visit_cost_submissions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_cost_submissions_mmp_file" ON "public"."site_visit_cost_submissions" USING "btree" ("mmp_file_id");



CREATE INDEX "idx_cost_submissions_project" ON "public"."site_visit_cost_submissions" USING "btree" ("project_id");



CREATE INDEX "idx_cost_submissions_reviewed_by" ON "public"."site_visit_cost_submissions" USING "btree" ("reviewed_by");



CREATE INDEX "idx_cost_submissions_site_visit" ON "public"."site_visit_cost_submissions" USING "btree" ("site_visit_id");



CREATE INDEX "idx_cost_submissions_status" ON "public"."site_visit_cost_submissions" USING "btree" ("status");



CREATE INDEX "idx_cost_submissions_submitted_by" ON "public"."site_visit_cost_submissions" USING "btree" ("submitted_by");



CREATE INDEX "idx_deletion_audit_log_deleted_by" ON "public"."deletion_audit_log" USING "btree" ("deleted_by");



CREATE INDEX "idx_deletion_audit_log_table" ON "public"."deletion_audit_log" USING "btree" ("table_name");



CREATE INDEX "idx_digital_signatures_is_template" ON "public"."digital_signatures" USING "btree" ("is_template") WHERE ("is_template" = true);



CREATE INDEX "idx_digital_signatures_source_signature_id" ON "public"."digital_signatures" USING "btree" ("source_signature_id") WHERE ("source_signature_id" IS NOT NULL);



CREATE INDEX "idx_digital_signatures_user_id" ON "public"."digital_signatures" USING "btree" ("user_id");



CREATE INDEX "idx_digital_signatures_verification_status" ON "public"."digital_signatures" USING "btree" ("verification_status");



CREATE INDEX "idx_down_payment_requests_hub" ON "public"."down_payment_requests" USING "btree" ("hub_id");



CREATE INDEX "idx_down_payment_requests_mmp_entry" ON "public"."down_payment_requests" USING "btree" ("mmp_site_entry_id");



CREATE INDEX "idx_down_payment_requests_requester" ON "public"."down_payment_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_down_payment_requests_site_visit" ON "public"."down_payment_requests" USING "btree" ("site_visit_id");



CREATE INDEX "idx_down_payment_requests_status" ON "public"."down_payment_requests" USING "btree" ("status");



CREATE INDEX "idx_down_payment_requests_supervisor" ON "public"."down_payment_requests" USING "btree" ("supervisor_id");



CREATE INDEX "idx_fee_struct_active" ON "public"."classification_fee_structures" USING "btree" ("is_active");



CREATE INDEX "idx_fee_struct_level_role" ON "public"."classification_fee_structures" USING "btree" ("classification_level", "role_scope");



CREATE INDEX "idx_fee_struct_validity" ON "public"."classification_fee_structures" USING "btree" ("effective_from", "effective_until");



CREATE INDEX "idx_feedback_assigned_to" ON "public"."feedback" USING "btree" ("assigned_to");



CREATE INDEX "idx_feedback_created_at" ON "public"."feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_feedback_priority" ON "public"."feedback" USING "btree" ("priority");



CREATE INDEX "idx_feedback_status" ON "public"."feedback" USING "btree" ("status");



CREATE INDEX "idx_feedback_user_id" ON "public"."feedback" USING "btree" ("user_id");



CREATE INDEX "idx_handwriting_signatures_user_id" ON "public"."handwriting_signatures" USING "btree" ("user_id");



CREATE INDEX "idx_historical_site_costs_locality_id" ON "public"."historical_site_costs" USING "btree" ("locality_id");



CREATE INDEX "idx_historical_site_costs_site_id" ON "public"."historical_site_costs" USING "btree" ("site_id");



CREATE INDEX "idx_historical_site_costs_state_id" ON "public"."historical_site_costs" USING "btree" ("state_id");



CREATE INDEX "idx_historical_site_costs_visit_date" ON "public"."historical_site_costs" USING "btree" ("visit_date");



CREATE INDEX "idx_hub_states_hub" ON "public"."hub_states" USING "btree" ("hub_id");



CREATE INDEX "idx_hub_states_state" ON "public"."hub_states" USING "btree" ("state_id");



CREATE INDEX "idx_hubs_active" ON "public"."hubs" USING "btree" ("is_active");



CREATE INDEX "idx_hubs_name" ON "public"."hubs" USING "btree" ("name");



CREATE INDEX "idx_incident_reports_user_id" ON "public"."incident_reports" USING "btree" ("user_id");



CREATE INDEX "idx_location_logs_site_visit_id" ON "public"."location_logs" USING "btree" ("site_visit_id");



CREATE INDEX "idx_location_logs_timestamp" ON "public"."location_logs" USING "btree" ("timestamp");



CREATE INDEX "idx_location_logs_user_id" ON "public"."location_logs" USING "btree" ("user_id");



CREATE INDEX "idx_location_logs_visit_id" ON "public"."location_logs" USING "btree" ("visit_id");



CREATE INDEX "idx_mmp_budgets_mmp_file_id" ON "public"."mmp_budgets" USING "btree" ("mmp_file_id");



CREATE INDEX "idx_mmp_budgets_project_budget_id" ON "public"."mmp_budgets" USING "btree" ("project_budget_id");



CREATE INDEX "idx_mmp_budgets_status" ON "public"."mmp_budgets" USING "btree" ("status");



CREATE INDEX "idx_mmp_files_created_at" ON "public"."mmp_files" USING "btree" ("created_at");



CREATE INDEX "idx_mmp_files_cycle_status" ON "public"."mmp_files" USING "btree" ("cycle_status");



CREATE INDEX "idx_mmp_files_project_id" ON "public"."mmp_files" USING "btree" ("project_id");



CREATE INDEX "idx_mmp_files_status" ON "public"."mmp_files" USING "btree" ("status");



CREATE INDEX "idx_mmp_site_entries_accepted_at" ON "public"."mmp_site_entries" USING "btree" ("accepted_at");



CREATE INDEX "idx_mmp_site_entries_accepted_by" ON "public"."mmp_site_entries" USING "btree" ("accepted_by");



CREATE INDEX "idx_mmp_site_entries_claimed_by" ON "public"."mmp_site_entries" USING "btree" ("claimed_by") WHERE ("claimed_by" IS NOT NULL);



CREATE INDEX "idx_mmp_site_entries_completed_by" ON "public"."mmp_site_entries" USING "btree" ("completed_by_user_id");



CREATE INDEX "idx_mmp_site_entries_completed_by_user_id" ON "public"."mmp_site_entries" USING "btree" ("completed_by_user_id");



CREATE INDEX "idx_mmp_site_entries_cost" ON "public"."mmp_site_entries" USING "btree" ("cost");



CREATE INDEX "idx_mmp_site_entries_cost_acknowledged" ON "public"."mmp_site_entries" USING "btree" ("cost_acknowledged") WHERE ("cost_acknowledged" = true);



CREATE INDEX "idx_mmp_site_entries_created_at" ON "public"."mmp_site_entries" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_mmp_site_entries_dispatched_at" ON "public"."mmp_site_entries" USING "btree" ("dispatched_at");



CREATE INDEX "idx_mmp_site_entries_dispatched_by" ON "public"."mmp_site_entries" USING "btree" ("dispatched_by");



CREATE INDEX "idx_mmp_site_entries_file_id" ON "public"."mmp_site_entries" USING "btree" ("mmp_file_id");



CREATE INDEX "idx_mmp_site_entries_forwarded_at" ON "public"."mmp_site_entries" USING "btree" ("forwarded_at");



CREATE INDEX "idx_mmp_site_entries_forwarded_by_at" ON "public"."mmp_site_entries" USING "btree" ("forwarded_by_user_id", "forwarded_at");



CREATE INDEX "idx_mmp_site_entries_forwarded_by_user_id" ON "public"."mmp_site_entries" USING "btree" ("forwarded_by_user_id");



CREATE INDEX "idx_mmp_site_entries_forwarded_status" ON "public"."mmp_site_entries" USING "btree" ("forwarded_at") WHERE ("forwarded_at" IS NOT NULL);



CREATE INDEX "idx_mmp_site_entries_forwarded_to_at" ON "public"."mmp_site_entries" USING "btree" ("forwarded_to_user_id", "forwarded_at");



CREATE INDEX "idx_mmp_site_entries_forwarded_to_user_id" ON "public"."mmp_site_entries" USING "btree" ("forwarded_to_user_id");



CREATE INDEX "idx_mmp_site_entries_hub_state" ON "public"."mmp_site_entries" USING "btree" ("hub_office", "state");



CREATE INDEX "idx_mmp_site_entries_mmp_file" ON "public"."mmp_site_entries" USING "btree" ("mmp_file_id");



CREATE INDEX "idx_mmp_site_entries_registry_site_id" ON "public"."mmp_site_entries" USING "btree" ("registry_site_id");



CREATE INDEX "idx_mmp_site_entries_rejected_at" ON "public"."mmp_site_entries" USING "btree" ("rejected_at") WHERE ("status" = 'Rejected'::"text");



CREATE INDEX "idx_mmp_site_entries_rejected_by" ON "public"."mmp_site_entries" USING "btree" ("rejected_by") WHERE ("status" = 'Rejected'::"text");



CREATE INDEX "idx_mmp_site_entries_site_code" ON "public"."mmp_site_entries" USING "btree" ("site_code");



CREATE INDEX "idx_mmp_site_entries_status" ON "public"."mmp_site_entries" USING "btree" ("status");



CREATE INDEX "idx_mmp_site_entries_status_claimed" ON "public"."mmp_site_entries" USING "btree" ("status", "claimed_by") WHERE ("status" = 'Dispatched'::"text");



CREATE INDEX "idx_mmp_site_entries_updated_at" ON "public"."mmp_site_entries" USING "btree" ("updated_at");



CREATE INDEX "idx_mmp_site_entries_verified_at" ON "public"."mmp_site_entries" USING "btree" ("verified_at");



CREATE INDEX "idx_mmp_site_entries_verified_by" ON "public"."mmp_site_entries" USING "btree" ("verified_by");



CREATE INDEX "idx_mmp_site_entries_verified_by_user_id" ON "public"."mmp_site_entries" USING "btree" ("verified_by_user_id");



CREATE INDEX "idx_mmp_site_entries_visit_completed_at" ON "public"."mmp_site_entries" USING "btree" ("visit_completed_at");



CREATE INDEX "idx_mmp_site_entries_visit_started_at" ON "public"."mmp_site_entries" USING "btree" ("visit_started_at");



CREATE INDEX "idx_notifications_created" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_recipient" ON "public"."notifications" USING "btree" ("recipient_id");



CREATE INDEX "idx_operational_costs_category" ON "public"."operational_cost_submissions" USING "btree" ("expense_category");



CREATE INDEX "idx_operational_costs_date" ON "public"."operational_cost_submissions" USING "btree" ("expense_date");



CREATE INDEX "idx_operational_costs_hub" ON "public"."operational_cost_submissions" USING "btree" ("hub_id");



CREATE INDEX "idx_operational_costs_project" ON "public"."operational_cost_submissions" USING "btree" ("project_id");



CREATE INDEX "idx_operational_costs_status" ON "public"."operational_cost_submissions" USING "btree" ("status");



CREATE INDEX "idx_operational_costs_submitted_by" ON "public"."operational_cost_submissions" USING "btree" ("submitted_by");



CREATE INDEX "idx_operational_costs_tier1_status" ON "public"."operational_cost_submissions" USING "btree" ("tier1_status");



CREATE INDEX "idx_operational_costs_tier2_status" ON "public"."operational_cost_submissions" USING "btree" ("tier2_status");



CREATE INDEX "idx_operational_costs_tier3_status" ON "public"."operational_cost_submissions" USING "btree" ("tier3_status");



CREATE INDEX "idx_password_reset_tokens_email" ON "public"."password_reset_tokens" USING "btree" ("email");



CREATE INDEX "idx_payment_methods_is_default" ON "public"."payment_methods" USING "btree" ("user_id", "is_default");



CREATE INDEX "idx_payment_methods_type" ON "public"."payment_methods" USING "btree" ("type");



CREATE INDEX "idx_payment_methods_user_id" ON "public"."payment_methods" USING "btree" ("user_id");



CREATE INDEX "idx_payout_requested_at" ON "public"."payout_requests" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_payout_requests_requested_at" ON "public"."payout_requests" USING "btree" ("requested_at" DESC);



CREATE INDEX "idx_payout_requests_status" ON "public"."payout_requests" USING "btree" ("status");



CREATE INDEX "idx_payout_requests_user_id" ON "public"."payout_requests" USING "btree" ("user_id");



CREATE INDEX "idx_payout_user_status" ON "public"."payout_requests" USING "btree" ("user_id", "status");



CREATE INDEX "idx_permissions_resource_action" ON "public"."permissions" USING "btree" ("resource", "action");



CREATE INDEX "idx_permissions_role_id" ON "public"."permissions" USING "btree" ("role_id");



CREATE INDEX "idx_profiles_fcm_token_updated_at" ON "public"."profiles" USING "btree" ("fcm_token_updated_at" DESC);



CREATE INDEX "idx_profiles_last_active_at" ON "public"."profiles" USING "btree" ("last_active_at" DESC);



CREATE INDEX "idx_project_activities_assigned_to" ON "public"."project_activities" USING "btree" ("assigned_to");



CREATE INDEX "idx_project_activities_project_id" ON "public"."project_activities" USING "btree" ("project_id");



CREATE INDEX "idx_project_budgets_created_at" ON "public"."project_budgets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_project_budgets_fiscal_year" ON "public"."project_budgets" USING "btree" ("fiscal_year");



CREATE INDEX "idx_project_budgets_period" ON "public"."project_budgets" USING "btree" ("budget_period");



CREATE INDEX "idx_project_budgets_project_id" ON "public"."project_budgets" USING "btree" ("project_id");



CREATE INDEX "idx_project_budgets_status" ON "public"."project_budgets" USING "btree" ("status");



CREATE INDEX "idx_project_scopes_hub" ON "public"."project_scopes" USING "btree" ("hub_id");



CREATE INDEX "idx_projects_budget" ON "public"."projects" USING "gin" ("budget");



CREATE INDEX "idx_report_photos_report_id" ON "public"."report_photos" USING "btree" ("report_id");



CREATE INDEX "idx_reports_coordinates_gin" ON "public"."reports" USING "gin" ("coordinates");



CREATE INDEX "idx_reports_site_visit_id" ON "public"."reports" USING "btree" ("site_visit_id");



CREATE INDEX "idx_reports_submitted_by" ON "public"."reports" USING "btree" ("submitted_by");



CREATE INDEX "idx_site_locations_geom" ON "public"."site_locations" USING "gist" ("geom");



CREATE INDEX "idx_site_locations_recorded_at" ON "public"."site_locations" USING "btree" ("recorded_at");



CREATE INDEX "idx_site_locations_site_id" ON "public"."site_locations" USING "btree" ("site_id");



CREATE INDEX "idx_site_visit_costs_site_visit_id" ON "public"."site_visit_costs" USING "btree" ("site_visit_id");



CREATE INDEX "idx_site_visits_assigned_to" ON "public"."site_visits" USING "btree" ("assigned_to");



CREATE INDEX "idx_site_visits_created_at" ON "public"."site_visits" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_site_visits_not_covered" ON "public"."site_visits" USING "btree" ("mmp_id", "not_covered_flag") WHERE ("not_covered_flag" = true);



CREATE INDEX "idx_site_visits_status" ON "public"."site_visits" USING "btree" ("status");



CREATE INDEX "idx_sites_code" ON "public"."sites_registry" USING "btree" ("site_code");



CREATE INDEX "idx_sites_hub" ON "public"."sites_registry" USING "btree" ("hub_id");



CREATE INDEX "idx_sites_locality" ON "public"."sites_registry" USING "btree" ("locality_id");



CREATE INDEX "idx_sites_state" ON "public"."sites_registry" USING "btree" ("state_id");



CREATE INDEX "idx_sites_status" ON "public"."sites_registry" USING "btree" ("status");



CREATE INDEX "idx_sub_activities_activity_id" ON "public"."sub_activities" USING "btree" ("activity_id");



CREATE INDEX "idx_sub_activities_assigned_to" ON "public"."sub_activities" USING "btree" ("assigned_to");



CREATE INDEX "idx_sub_activities_due_date" ON "public"."sub_activities" USING "btree" ("due_date");



CREATE INDEX "idx_super_admins_active" ON "public"."super_admins" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_super_admins_user" ON "public"."super_admins" USING "btree" ("user_id");



CREATE INDEX "idx_support_tickets_assigned_to" ON "public"."support_tickets" USING "btree" ("assigned_to");



CREATE INDEX "idx_support_tickets_created_at" ON "public"."support_tickets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_support_tickets_priority" ON "public"."support_tickets" USING "btree" ("priority");



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "idx_support_tickets_user_id" ON "public"."support_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_ticket_messages_created_at" ON "public"."ticket_messages" USING "btree" ("created_at");



CREATE INDEX "idx_ticket_messages_ticket_id" ON "public"."ticket_messages" USING "btree" ("ticket_id");



CREATE UNIQUE INDEX "idx_unique_active_fee" ON "public"."classification_fee_structures" USING "btree" ("classification_level", "role_scope", "currency") WHERE (("is_active" = true) AND ("effective_until" IS NULL));



CREATE INDEX "idx_user_class_active" ON "public"."user_classifications" USING "btree" ("is_active");



CREATE INDEX "idx_user_class_effective" ON "public"."user_classifications" USING "btree" ("effective_from", "effective_until");



CREATE INDEX "idx_user_class_level" ON "public"."user_classifications" USING "btree" ("classification_level");



CREATE INDEX "idx_user_class_user" ON "public"."user_classifications" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_role_id" ON "public"."user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_user_roles_status" ON "public"."user_roles" USING "btree" ("status");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_user_signatures_user_id" ON "public"."user_signatures" USING "btree" ("user_id");



CREATE INDEX "idx_visit_rejections_user_id" ON "public"."visit_rejections" USING "btree" ("user_id");



CREATE INDEX "idx_visit_rejections_visit_id" ON "public"."visit_rejections" USING "btree" ("visit_id");



CREATE INDEX "idx_visit_status_site_visit_id" ON "public"."visit_status" USING "btree" ("site_visit_id");



CREATE INDEX "idx_wallet_balances_status" ON "public"."wallet_balances" USING "btree" ("status");



CREATE INDEX "idx_wallet_balances_user_id" ON "public"."wallet_balances" USING "btree" ("user_id");



CREATE INDEX "idx_wallet_trans_created" ON "public"."wallet_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_trans_user" ON "public"."wallet_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_wallet_transactions_created_at" ON "public"."wallet_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_transactions_site_visit_id" ON "public"."wallet_transactions" USING "btree" ("related_site_visit_id");



CREATE INDEX "idx_wallet_transactions_status" ON "public"."wallet_transactions" USING "btree" ("status");



CREATE INDEX "idx_wallet_transactions_type" ON "public"."wallet_transactions" USING "btree" ("type");



CREATE INDEX "idx_wallet_transactions_user_id" ON "public"."wallet_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_wallet_transactions_wallet_id" ON "public"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallet_tx_related_visit" ON "public"."wallet_transactions" USING "btree" ("related_site_visit_id");



CREATE INDEX "idx_wallet_tx_user_created" ON "public"."wallet_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_wallet_tx_user_type" ON "public"."wallet_transactions" USING "btree" ("user_id", "type");



CREATE INDEX "idx_wallets_user_id" ON "public"."wallets" USING "btree" ("user_id");



CREATE INDEX "idx_withdrawal_requests_created_at" ON "public"."withdrawal_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_withdrawal_requests_status" ON "public"."withdrawal_requests" USING "btree" ("status");



CREATE INDEX "idx_withdrawal_requests_user_id" ON "public"."withdrawal_requests" USING "btree" ("user_id");



CREATE INDEX "idx_withdrawal_requests_wallet_id" ON "public"."withdrawal_requests" USING "btree" ("wallet_id");



CREATE INDEX "mmp_files_approvedat_idx" ON "public"."mmp_files" USING "btree" ("approvedat");



CREATE INDEX "mmp_files_approvedby_idx" ON "public"."mmp_files" USING "btree" ("approvedby");



CREATE INDEX "mmp_files_archivedat_idx" ON "public"."mmp_files" USING "btree" ("archivedat");



CREATE INDEX "mmp_files_hub_idx" ON "public"."mmp_files" USING "btree" ("hub");



CREATE INDEX "mmp_files_month_idx" ON "public"."mmp_files" USING "btree" ("month");



CREATE INDEX "mmp_files_rejectionreason_idx" ON "public"."mmp_files" USING "btree" ("rejectionreason");



CREATE INDEX "mmp_files_uploaded_by_idx" ON "public"."mmp_files" USING "btree" ("uploaded_by");



CREATE INDEX "mmp_site_entries_cost_acknowledged_idx" ON "public"."mmp_site_entries" USING "btree" ("cost_acknowledged");



CREATE INDEX "mmp_site_entries_enumerator_fee_idx" ON "public"."mmp_site_entries" USING "btree" ("enumerator_fee");



CREATE INDEX "mmp_site_entries_locality_idx" ON "public"."mmp_site_entries" USING "btree" ("locality");



CREATE INDEX "mmp_site_entries_main_activity_idx" ON "public"."mmp_site_entries" USING "btree" ("main_activity");



CREATE INDEX "mmp_site_entries_site_name_idx" ON "public"."mmp_site_entries" USING "btree" ("site_name");



CREATE INDEX "mmp_site_entries_use_warehouse_monitoring_idx" ON "public"."mmp_site_entries" USING "btree" ("use_warehouse_monitoring");



CREATE INDEX "mmp_site_entries_visit_completed_by_idx" ON "public"."mmp_site_entries" USING "btree" ("visit_completed_by");



CREATE UNIQUE INDEX "permissions_unique_role_resource_action" ON "public"."permissions" USING "btree" ("role_id", "resource", "action");



CREATE INDEX "profiles_email_idx" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "profiles_hub_id_idx" ON "public"."profiles" USING "btree" ("hub_id");



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "profiles_username_idx" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "sites_registry_locality_name_idx" ON "public"."sites_registry" USING "btree" ("locality_name");



CREATE INDEX "user_classifications_effective_from_idx" ON "public"."user_classifications" USING "btree" ("effective_from");



CREATE UNIQUE INDEX "user_roles_unique_user_role" ON "public"."user_roles" USING "btree" ("user_id", "role") WHERE ("role" IS NOT NULL);



CREATE UNIQUE INDEX "user_roles_unique_user_role_id" ON "public"."user_roles" USING "btree" ("user_id", "role_id") WHERE ("role_id" IS NOT NULL);



CREATE INDEX "user_roles_user_role_idx" ON "public"."user_roles" USING "btree" ("user_id", "role");



CREATE UNIQUE INDEX "user_roles_user_role_unique" ON "public"."user_roles" USING "btree" ("user_id", "role");



CREATE UNIQUE INDEX "ux_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "wallet_transactions_site_visit_unique" ON "public"."wallet_transactions" USING "btree" ("site_visit_id") WHERE ("site_visit_id" IS NOT NULL);



CREATE INDEX "wallets_total_withdrawn_idx" ON "public"."wallets" USING "btree" ("total_withdrawn");



CREATE INDEX "wallets_total_withdrawn_idx1" ON "public"."wallets" USING "btree" ("total_withdrawn");



CREATE OR REPLACE TRIGGER "app_versions_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."update_app_versions_updated_at"();



CREATE OR REPLACE TRIGGER "auto_assign_supervisor" BEFORE INSERT ON "public"."down_payment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."assign_supervisor_to_down_payment_request"();



CREATE OR REPLACE TRIGGER "auto_create_wallet" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_wallet_for_user"();



CREATE OR REPLACE TRIGGER "calculate_remaining_amount" BEFORE INSERT OR UPDATE ON "public"."down_payment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_down_payment_remaining_amount"();



CREATE OR REPLACE TRIGGER "chat_messages_broadcast_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."chat_messages_broadcast_trigger"();



CREATE OR REPLACE TRIGGER "chat_messages_touch_chat" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_chat_updated_at"();



CREATE OR REPLACE TRIGGER "check_super_admin_limit" BEFORE INSERT OR UPDATE ON "public"."super_admins" FOR EACH ROW WHEN (("new"."is_active" = true)) EXECUTE FUNCTION "public"."enforce_super_admin_limit"();



CREATE OR REPLACE TRIGGER "ensure_single_default_trigger" BEFORE INSERT OR UPDATE ON "public"."payment_methods" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_payment_method"();



CREATE OR REPLACE TRIGGER "mmp_site_entries_updated_at_trigger" BEFORE UPDATE ON "public"."mmp_site_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_mmp_site_entries_updated_at"();



CREATE OR REPLACE TRIGGER "on_mmp_site_entries_cost_acknowledged" BEFORE UPDATE OF "cost_acknowledged" ON "public"."mmp_site_entries" FOR EACH ROW EXECUTE FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"();



CREATE OR REPLACE TRIGGER "on_profile_deleted" AFTER DELETE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profile_deleted"();



CREATE OR REPLACE TRIGGER "set_chats_updated_at" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_feedback_updated_at" BEFORE UPDATE ON "public"."feedback" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_mmp_files_updated_at" BEFORE UPDATE ON "public"."mmp_files" FOR EACH ROW EXECUTE FUNCTION "public"."set_mmp_files_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_roles_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_roles_updated_at"();



CREATE OR REPLACE TRIGGER "trg_calculate_total_cost" BEFORE INSERT OR UPDATE OF "transportation_cost_cents", "accommodation_cost_cents", "meal_allowance_cents", "other_costs_cents" ON "public"."site_visit_cost_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_total_cost_submission"();



CREATE OR REPLACE TRIGGER "trg_fee_on_assignment_biu" BEFORE INSERT OR UPDATE OF "status", "accepted_by", "enumerator_fee", "transport_fee", "cost" ON "public"."mmp_site_entries" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_fee_on_assignment"();



CREATE OR REPLACE TRIGGER "trg_payout_before_insert_ensure" BEFORE INSERT ON "public"."payout_requests" FOR EACH ROW EXECUTE FUNCTION "public"."payout_req_ensure_wallet"();



CREATE OR REPLACE TRIGGER "trg_payout_req_after_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."payout_requests" FOR EACH ROW EXECUTE FUNCTION "public"."payout_req_after_change"();



CREATE OR REPLACE TRIGGER "trg_record_cost_approval_action" AFTER INSERT OR UPDATE ON "public"."site_visit_cost_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."record_cost_approval_action"();



CREATE OR REPLACE TRIGGER "trg_set_site_location_user" BEFORE INSERT ON "public"."site_locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_site_location_user"();



CREATE OR REPLACE TRIGGER "trg_sync_site_visits_fees_aft" AFTER INSERT OR UPDATE OF "status", "accepted_by", "enumerator_fee", "transport_fee", "cost" ON "public"."mmp_site_entries" FOR EACH ROW EXECUTE FUNCTION "public"."sync_site_visits_fees_on_assignment"();



CREATE OR REPLACE TRIGGER "trg_update_cost_submission_timestamp" BEFORE UPDATE ON "public"."site_visit_cost_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_cost_submission_timestamp"();



CREATE OR REPLACE TRIGGER "trg_wallet_tx_after_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."wallet_tx_after_change"();



CREATE OR REPLACE TRIGGER "trg_wallet_tx_before_ins_upd_posted" BEFORE INSERT OR UPDATE ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."wallet_tx_set_posted_at"();



CREATE OR REPLACE TRIGGER "trg_wallet_tx_before_insert_ensure" BEFORE INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."wallet_tx_ensure_wallet"();



CREATE OR REPLACE TRIGGER "trigger_create_wallet_transaction_on_completion" AFTER UPDATE OF "status" ON "public"."mmp_site_entries" FOR EACH ROW WHEN ((("new"."status" IS DISTINCT FROM "old"."status") AND ("lower"("new"."status") = 'completed'::"text") AND (("old"."status" IS NULL) OR ("lower"("old"."status") <> 'completed'::"text")))) EXECUTE FUNCTION "public"."create_wallet_transaction_on_completion"();



COMMENT ON TRIGGER "trigger_create_wallet_transaction_on_completion" ON "public"."mmp_site_entries" IS 'Triggers wallet transaction creation when site status changes to Completed';



CREATE OR REPLACE TRIGGER "trigger_fee_struct_updated" BEFORE UPDATE ON "public"."classification_fee_structures" FOR EACH ROW EXECUTE FUNCTION "public"."update_classification_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_notify_admins_on_audit_log" AFTER INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_admins_on_audit_log"();



COMMENT ON TRIGGER "trigger_notify_admins_on_audit_log" ON "public"."audit_logs" IS 'Triggers notification creation for admins on each new audit log entry';



CREATE OR REPLACE TRIGGER "trigger_operational_cost_updated_at" BEFORE UPDATE ON "public"."operational_cost_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_operational_cost_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_site_visit_costs_updated_at" BEFORE UPDATE ON "public"."site_visit_costs" FOR EACH ROW EXECUTE FUNCTION "public"."update_site_visit_costs_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_support_tickets_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_support_tickets_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_wallet_balance" AFTER INSERT OR UPDATE ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_wallet_balance"();



CREATE OR REPLACE TRIGGER "trigger_user_class_updated" BEFORE UPDATE ON "public"."user_classifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_classification_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_wallet_updated_at" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."update_wallet_updated_at"();



CREATE OR REPLACE TRIGGER "update_hubs_timestamp" BEFORE UPDATE ON "public"."hubs" FOR EACH ROW EXECUTE FUNCTION "public"."update_hub_ops_timestamp"();



CREATE OR REPLACE TRIGGER "update_profiles_last_active_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."update_last_active_at"();



CREATE OR REPLACE TRIGGER "update_scopes_timestamp" BEFORE UPDATE ON "public"."project_scopes" FOR EACH ROW EXECUTE FUNCTION "public"."update_hub_ops_timestamp"();



CREATE OR REPLACE TRIGGER "update_sites_timestamp" BEFORE UPDATE ON "public"."sites_registry" FOR EACH ROW EXECUTE FUNCTION "public"."update_hub_ops_timestamp"();



CREATE OR REPLACE TRIGGER "update_withdrawal_requests_updated_at" BEFORE UPDATE ON "public"."withdrawal_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_withdrawal_requests_updated_at"();



CREATE OR REPLACE TRIGGER "user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_roles_updated_at"();



ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_mmp_budget_id_fkey" FOREIGN KEY ("mmp_budget_id") REFERENCES "public"."mmp_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_project_budget_id_fkey" FOREIGN KEY ("project_budget_id") REFERENCES "public"."project_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_mmp_budget_id_fkey" FOREIGN KEY ("mmp_budget_id") REFERENCES "public"."mmp_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_project_budget_id_fkey" FOREIGN KEY ("project_budget_id") REFERENCES "public"."project_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transactions"
    ADD CONSTRAINT "budget_transactions_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."call_history"
    ADD CONSTRAINT "call_history_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."call_history"
    ADD CONSTRAINT "call_history_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classification_fee_structures"
    ADD CONSTRAINT "classification_fee_structures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."classification_fee_structures"
    ADD CONSTRAINT "classification_fee_structures_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."comprehensive_monitoring_checklists"
    ADD CONSTRAINT "comprehensive_monitoring_checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_adjustment_audit"
    ADD CONSTRAINT "cost_adjustment_audit_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cost_approval_history"
    ADD CONSTRAINT "cost_approval_history_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."site_visit_cost_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_settings"
    ADD CONSTRAINT "dashboard_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_visibility_settings"
    ADD CONSTRAINT "data_visibility_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deletion_audit_log"
    ADD CONSTRAINT "deletion_audit_log_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."deletion_audit_log"
    ADD CONSTRAINT "deletion_audit_log_restored_by_fkey" FOREIGN KEY ("restored_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."digital_signatures"
    ADD CONSTRAINT "digital_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."down_payment_requests"
    ADD CONSTRAINT "down_payment_requests_admin_processed_by_fkey" FOREIGN KEY ("admin_processed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."down_payment_requests"
    ADD CONSTRAINT "down_payment_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."down_payment_requests"
    ADD CONSTRAINT "down_payment_requests_supervisor_approved_by_fkey" FOREIGN KEY ("supervisor_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."down_payment_requests"
    ADD CONSTRAINT "down_payment_requests_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."handwriting_signatures"
    ADD CONSTRAINT "handwriting_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."hub_states"
    ADD CONSTRAINT "hub_states_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_reports"
    ADD CONSTRAINT "incident_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."incident_reports"
    ADD CONSTRAINT "incident_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_logs"
    ADD CONSTRAINT "location_logs_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_logs"
    ADD CONSTRAINT "location_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_logs"
    ADD CONSTRAINT "location_logs_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmp_budgets"
    ADD CONSTRAINT "mmp_budgets_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mmp_budgets"
    ADD CONSTRAINT "mmp_budgets_mmp_file_id_fkey" FOREIGN KEY ("mmp_file_id") REFERENCES "public"."mmp_files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmp_budgets"
    ADD CONSTRAINT "mmp_budgets_parent_budget_id_fkey" FOREIGN KEY ("parent_budget_id") REFERENCES "public"."mmp_budgets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_budgets"
    ADD CONSTRAINT "mmp_budgets_project_budget_id_fkey" FOREIGN KEY ("project_budget_id") REFERENCES "public"."project_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmp_files"
    ADD CONSTRAINT "mmp_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_cost_acknowledged_by_fkey" FOREIGN KEY ("cost_acknowledged_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_forwarded_by_user_id_fkey" FOREIGN KEY ("forwarded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_forwarded_to_user_id_fkey" FOREIGN KEY ("forwarded_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_mmp_file_id_fkey" FOREIGN KEY ("mmp_file_id") REFERENCES "public"."mmp_files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_registry_site_id_fkey" FOREIGN KEY ("registry_site_id") REFERENCES "public"."sites_registry"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_visit_completed_by_fkey" FOREIGN KEY ("visit_completed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mmp_site_entries"
    ADD CONSTRAINT "mmp_site_entries_visit_started_by_fkey" FOREIGN KEY ("visit_started_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_mmp_file_id_fkey" FOREIGN KEY ("mmp_file_id") REFERENCES "public"."mmp_files"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_tier1_approved_by_fkey" FOREIGN KEY ("tier1_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_tier2_approved_by_fkey" FOREIGN KEY ("tier2_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."operational_cost_submissions"
    ADD CONSTRAINT "operational_cost_submissions_tier3_approved_by_fkey" FOREIGN KEY ("tier3_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_requests"
    ADD CONSTRAINT "payout_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_activities"
    ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_budgets"
    ADD CONSTRAINT "project_budgets_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."project_budgets"
    ADD CONSTRAINT "project_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_budgets"
    ADD CONSTRAINT "project_budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_budgets"
    ADD CONSTRAINT "project_budgets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_scopes"
    ADD CONSTRAINT "project_scopes_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_scopes"
    ADD CONSTRAINT "project_scopes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_photos"
    ADD CONSTRAINT "report_photos_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."safety_checklists"
    ADD CONSTRAINT "safety_checklists_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."safety_checklists"
    ADD CONSTRAINT "safety_checklists_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_locations"
    ADD CONSTRAINT "site_locations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_locations"
    ADD CONSTRAINT "site_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visit_cost_submissions"
    ADD CONSTRAINT "site_visit_cost_submissions_mmp_file_id_fkey" FOREIGN KEY ("mmp_file_id") REFERENCES "public"."mmp_files"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visit_cost_submissions"
    ADD CONSTRAINT "site_visit_cost_submissions_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visit_cost_submissions"
    ADD CONSTRAINT "site_visit_cost_submissions_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."site_visit_costs"
    ADD CONSTRAINT "site_visit_costs_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sites_registry"
    ADD CONSTRAINT "sites_registry_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sub_activities"
    ADD CONSTRAINT "sub_activities_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_appointed_by_fkey" FOREIGN KEY ("appointed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_deactivated_by_fkey" FOREIGN KEY ("deactivated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."support_contacts"
    ADD CONSTRAINT "support_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_budget_transactions"
    ADD CONSTRAINT "task_budget_transactions_task_budget_id_fkey" FOREIGN KEY ("task_budget_id") REFERENCES "public"."task_budgets"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_classifications"
    ADD CONSTRAINT "user_classifications_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_classifications"
    ADD CONSTRAINT "user_classifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_signatures"
    ADD CONSTRAINT "user_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_rejections"
    ADD CONSTRAINT "visit_rejections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_rejections"
    ADD CONSTRAINT "visit_rejections_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_status"
    ADD CONSTRAINT "visit_status_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_status"
    ADD CONSTRAINT "visit_status_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."wallet_balances"
    ADD CONSTRAINT "wallet_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settings"
    ADD CONSTRAINT "wallet_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_related_site_visit_id_fkey" FOREIGN KEY ("related_site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "public"."mmp_site_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_admin_processed_by_fkey" FOREIGN KEY ("admin_processed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



CREATE POLICY "Admin manage classification_fee_structures" ON "public"."classification_fee_structures" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'financialAdmin'::"text"]))))));



CREATE POLICY "Admin manage user_classifications" ON "public"."user_classifications" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'financialAdmin'::"text"]))))));



CREATE POLICY "Admins and supervisors can manage site visit costs" ON "public"."site_visit_costs" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("r"."name")::"text" = ANY ((ARRAY['admin'::character varying, 'supervisor'::character varying, 'coordinator'::character varying, 'financialAdmin'::character varying])::"text"[]))))));



CREATE POLICY "Admins can approve tier1 for operational costs" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("tier1_status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'Admin'::"text", 'SuperAdmin'::"text", 'superAdmin'::"text", 'super_admin'::"text", 'Super Admin'::"text", 'CountryDirector'::"text", 'countryDirector'::"text", 'Country Director'::"text"]))))))) WITH CHECK (("tier1_status" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])));



CREATE POLICY "Admins can delete operational cost submissions" ON "public"."operational_cost_submissions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'Admin'::"text", 'SuperAdmin'::"text", 'superAdmin'::"text", 'super_admin'::"text", 'Super Admin'::"text"]))))));



CREATE POLICY "Admins can delete support contacts" ON "public"."support_contacts" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert messages on any ticket" ON "public"."ticket_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'SuperAdmin'::"text"]))))) OR "public"."is_super_admin"())));



CREATE POLICY "Admins can insert support contacts" ON "public"."support_contacts" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert user_classifications" ON "public"."user_classifications" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'superadmin'::"text", 'superAdmin'::"text", 'ict'::"text"]))))));



CREATE POLICY "Admins can manage all transactions" ON "public"."wallet_transactions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all wallets" ON "public"."wallets" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage hub_states" ON "public"."hub_states" USING ("public"."is_admin_or_super"());



CREATE POLICY "Admins can manage hubs" ON "public"."hubs" USING ("public"."is_admin_or_super"());



CREATE POLICY "Admins can manage sites_registry" ON "public"."sites_registry" USING ("public"."is_admin_or_super"());



CREATE POLICY "Admins can manage user roles" ON "public"."user_roles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superAdmin'::"text", 'Admin'::"text", 'SuperAdmin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superAdmin'::"text", 'Admin'::"text", 'SuperAdmin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Admins can read all audit logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Super Admin'::"text", 'Admin'::"text", 'ICT'::"text"]))))));



CREATE POLICY "Admins can read audit logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superAdmin'::"text"]))))));



CREATE POLICY "Admins can recall operational cost submissions" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("status" = ANY (ARRAY['approved'::"text", 'under_review'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'Admin'::"text", 'SuperAdmin'::"text", 'superAdmin'::"text", 'super_admin'::"text", 'Super Admin'::"text"]))))))) WITH CHECK (("status" = ANY (ARRAY['pending'::"text", 'cancelled'::"text", 'rejected'::"text"])));



CREATE POLICY "Admins can update all signatures" ON "public"."digital_signatures" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("r"."name")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))));



CREATE POLICY "Admins can update all support tickets" ON "public"."support_tickets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['admin'::"text", 'SuperAdmin'::"text"])) OR "public"."is_super_admin"()))))) WITH CHECK (true);



CREATE POLICY "Admins can update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'superadmin'::"text", 'superAdmin'::"text", 'ict'::"text"]))))));



CREATE POLICY "Admins can update submissions" ON "public"."site_visit_cost_submissions" FOR UPDATE USING ("public"."is_cost_reviewer"());



CREATE POLICY "Admins can update support contacts" ON "public"."support_contacts" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update tier2 for all submissions" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("tier1_status" = 'approved'::"text") AND "public"."is_admin_or_super_admin"()));



CREATE POLICY "Admins can update transactions" ON "public"."wallet_transactions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("r"."name")::"text" = ANY ((ARRAY['admin'::character varying, 'financialAdmin'::character varying])::"text"[]))))));



CREATE POLICY "Admins can update user_classifications" ON "public"."user_classifications" FOR UPDATE TO "authenticated" USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'superadmin'::"text", 'superAdmin'::"text", 'ict'::"text"]))))));



CREATE POLICY "Admins can view all checklists" ON "public"."comprehensive_monitoring_checklists" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'coordinator'::"text"]))))));



CREATE POLICY "Admins can view all operational cost submissions" ON "public"."operational_cost_submissions" FOR SELECT USING ("public"."is_admin_or_super_admin"());



CREATE POLICY "Admins can view all signatures" ON "public"."digital_signatures" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("r"."name")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))));



CREATE POLICY "Admins can view all support tickets" ON "public"."support_tickets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['admin'::"text", 'SuperAdmin'::"text"])) OR "public"."is_super_admin"())))));



CREATE POLICY "Admins can view all ticket messages" ON "public"."ticket_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['admin'::"text", 'SuperAdmin'::"text"])) OR "public"."is_super_admin"())))));



CREATE POLICY "Admins can view all transactions" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text"]))))));



CREATE POLICY "Admins can view all wallets" ON "public"."wallets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text"]))))));



CREATE POLICY "Allow all for authenticated users" ON "public"."team_members" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated access to historical_site_costs" ON "public"."historical_site_costs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated users to read audit logs" ON "public"."audit_logs" FOR SELECT USING (true);



CREATE POLICY "Allow authenticated users to read down_payment_requests" ON "public"."down_payment_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update classification_fee_structur" ON "public"."classification_fee_structures" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow delete mmp_site_entries for authenticated" ON "public"."mmp_site_entries" FOR DELETE USING (((( SELECT "auth"."uid"() AS "uid") = ("accepted_by")::"uuid") OR ("accepted_by" IS NULL)));



CREATE POLICY "Allow delete report_photos for authenticated" ON "public"."report_photos" FOR DELETE USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Allow delete reports for authenticated" ON "public"."reports" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow delete site_locations for authenticated" ON "public"."site_locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow insert report_photos for authenticated" ON "public"."report_photos" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert reports for authenticated" ON "public"."reports" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert site_locations for authenticated" ON "public"."site_locations" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow read for all" ON "public"."mmp_files" FOR SELECT USING (true);



CREATE POLICY "Allow recipients to read their notifications" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() = "recipient_id") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow select report_photos for authenticated" ON "public"."report_photos" FOR SELECT USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Allow select reports for authenticated" ON "public"."reports" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow select site_locations for authenticated" ON "public"."site_locations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow service role to insert audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow super admin read" ON "public"."super_admins" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow super admin write" ON "public"."super_admins" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['superAdmin'::"text", 'SuperAdmin'::"text", 'super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "Allow update report_photos for authenticated" ON "public"."report_photos" FOR UPDATE USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "Allow update reports for authenticated" ON "public"."reports" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow update site_locations for authenticated" ON "public"."site_locations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Anyone can read app versions" ON "public"."app_versions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read hub_states" ON "public"."hub_states" FOR SELECT USING (true);



CREATE POLICY "Anyone can read hubs" ON "public"."hubs" FOR SELECT USING (true);



CREATE POLICY "Anyone can read sites_registry" ON "public"."sites_registry" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active support contacts" ON "public"."support_contacts" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert down_payment_requests" ON "public"."down_payment_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can read down_payment_requests" ON "public"."down_payment_requests" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can read profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update down_payment_requests" ON "public"."down_payment_requests" FOR UPDATE USING (true);



CREATE POLICY "Authorized roles can create operational cost submissions" ON "public"."operational_cost_submissions" FOR INSERT WITH CHECK ((("auth"."uid"() = "submitted_by") AND "public"."can_submit_operational_costs"()));



CREATE POLICY "Finance can process payments" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("status" = 'approved'::"text") AND ("tier1_status" = 'approved'::"text") AND ("tier2_status" = 'approved'::"text") AND "public"."is_admin_or_super_admin"()));



CREATE POLICY "Only admins can insert app versions" ON "public"."app_versions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_roles"."role" = 'Admin'::"text")))));



CREATE POLICY "Only admins can update app versions" ON "public"."app_versions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("user_roles"."role" = 'Admin'::"text")))));



CREATE POLICY "Public read classification_fee_structures" ON "public"."classification_fee_structures" FOR SELECT USING (true);



CREATE POLICY "Public read user_classifications" ON "public"."user_classifications" FOR SELECT USING (true);



CREATE POLICY "Role-based read access for down_payment_requests" ON "public"."down_payment_requests" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'Admin'::"text", 'superAdmin'::"text", 'SuperAdmin'::"text", 'financialAdmin'::"text", 'FinancialAdmin'::"text", 'supervisor'::"text", 'Supervisor'::"text", 'hubSupervisor'::"text", 'HubSupervisor'::"text", 'fom'::"text", 'FOM'::"text", 'ict'::"text", 'ICT'::"text"])))))));



CREATE POLICY "Service can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can manage password reset tokens" ON "public"."password_reset_tokens" USING (true) WITH CHECK (true);



CREATE POLICY "Service role inserts" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Super admins can read audit logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'superAdmin'::"text")))));



CREATE POLICY "Super admins can update any operational cost submission" ON "public"."operational_cost_submissions" FOR UPDATE USING ("public"."is_admin_or_super_admin"());



CREATE POLICY "Super admins can view all super_admins" ON "public"."super_admins" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['superAdmin'::"text", 'SuperAdmin'::"text", 'super_admin'::"text", 'admin'::"text", 'Admin'::"text"])))) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Supervisors can approve/reject withdrawal requests" ON "public"."withdrawal_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text", 'financialAdmin'::"text"]))))));



CREATE POLICY "Supervisors can manage site visit costs" ON "public"."site_visit_costs" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text", 'financialAdmin'::"text"]))))));



CREATE POLICY "Supervisors can update tier1 for hub submissions" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("tier1_status" = 'pending'::"text") AND "public"."is_hub_supervisor"("hub_id"))) WITH CHECK ((("tier2_status" = 'pending'::"text") AND ("tier2_approved_by" IS NULL) AND ("wallet_transaction_id" IS NULL) AND ("paid_at" IS NULL)));



CREATE POLICY "Supervisors can view all withdrawal requests" ON "public"."withdrawal_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text", 'financialAdmin'::"text"]))))));



CREATE POLICY "Supervisors can view hub operational cost submissions" ON "public"."operational_cost_submissions" FOR SELECT USING ("public"."is_hub_supervisor"("hub_id"));



CREATE POLICY "System can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "System can insert history" ON "public"."cost_approval_history" FOR INSERT WITH CHECK (true);



CREATE POLICY "System can insert transactions" ON "public"."wallet_transactions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can create own support tickets" ON "public"."support_tickets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create submissions" ON "public"."site_visit_cost_submissions" FOR INSERT WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "Users can create their own payout requests" ON "public"."payout_requests" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own withdrawal requests" ON "public"."withdrawal_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own call history" ON "public"."call_history" FOR DELETE USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can delete own checklists" ON "public"."comprehensive_monitoring_checklists" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can delete own payment methods" ON "public"."payment_methods" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own pending operational cost submissions" ON "public"."operational_cost_submissions" FOR DELETE USING ((("auth"."uid"() = "submitted_by") AND ("status" = 'pending'::"text") AND ("tier1_status" = 'pending'::"text")));



CREATE POLICY "Users can delete own pending submissions" ON "public"."site_visit_cost_submissions" FOR DELETE USING ((("submitted_by" = "auth"."uid"()) AND (("status")::"text" = 'pending'::"text")));



CREATE POLICY "Users can delete own signatures" ON "public"."digital_signatures" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own signatures" ON "public"."user_signatures" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own incident reports" ON "public"."incident_reports" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert call logs" ON "public"."call_logs" FOR INSERT WITH CHECK ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can insert messages in their chats" ON "public"."chat_messages" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can insert messages on own tickets" ON "public"."ticket_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."support_tickets" "st"
  WHERE (("st"."id" = "ticket_messages"."ticket_id") AND ("st"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("actor_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



CREATE POLICY "Users can insert own call history" ON "public"."call_history" FOR INSERT WITH CHECK ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can insert own checklists" ON "public"."comprehensive_monitoring_checklists" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own payment methods" ON "public"."payment_methods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own signatures" ON "public"."digital_signatures" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own signatures" ON "public"."user_signatures" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own incident reports" ON "public"."incident_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own signatures" ON "public"."handwriting_signatures" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own wallet" ON "public"."wallets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own chat participants" ON "public"."chat_participants" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage their own wallet settings" ON "public"."wallet_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can update own call history" ON "public"."call_history" FOR UPDATE USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can update own checklists" ON "public"."comprehensive_monitoring_checklists" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can update own open support tickets" ON "public"."support_tickets" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("status" = 'open'::"text"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own payment methods" ON "public"."payment_methods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own pending operational cost submissions" ON "public"."operational_cost_submissions" FOR UPDATE USING ((("auth"."uid"() = "submitted_by") AND ("status" = 'pending'::"text") AND ("tier1_status" = 'pending'::"text"))) WITH CHECK ((("auth"."uid"() = "submitted_by") AND ("status" = 'pending'::"text") AND ("tier1_status" = 'pending'::"text")));



CREATE POLICY "Users can update own pending submissions" ON "public"."site_visit_cost_submissions" FOR UPDATE USING ((("submitted_by" = "auth"."uid"()) AND (("status")::"text" = 'pending'::"text"))) WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own signatures" ON "public"."digital_signatures" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own signatures" ON "public"."user_signatures" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own call logs" ON "public"."call_logs" FOR UPDATE USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can update their own incident reports" ON "public"."incident_reports" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own messages" ON "public"."chat_messages" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "sender_id") OR (EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") OR (EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can update their own pending payout requests" ON "public"."payout_requests" FOR UPDATE USING (((("user_id" = "auth"."uid"()) AND ("status" = 'requested'::"public"."payout_status")) OR (EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("ur"."role_id" = "r"."id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("r"."name")::"text" = ANY ((ARRAY['admin'::character varying, 'financialAdmin'::character varying, 'supervisor'::character varying])::"text"[])))))));



CREATE POLICY "Users can update their own pending withdrawal requests" ON "public"."withdrawal_requests" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text")));



CREATE POLICY "Users can update their own signatures" ON "public"."handwriting_signatures" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own wallet" ON "public"."wallets" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view messages for own tickets" ON "public"."ticket_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "st"
  WHERE (("st"."id" = "ticket_messages"."ticket_id") AND ("st"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view messages in their chats" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view own call history" ON "public"."call_history" FOR SELECT USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can view own checklists" ON "public"."comprehensive_monitoring_checklists" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own operational cost submissions" ON "public"."operational_cost_submissions" FOR SELECT USING (("auth"."uid"() = "submitted_by"));



CREATE POLICY "Users can view own payment methods" ON "public"."payment_methods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own signatures" ON "public"."digital_signatures" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own signatures" ON "public"."user_signatures" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own submissions" ON "public"."site_visit_cost_submissions" FOR SELECT USING ((("submitted_by" = "auth"."uid"()) OR "public"."is_cost_reviewer"()));



CREATE POLICY "Users can view own support tickets" ON "public"."support_tickets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view relevant history" ON "public"."cost_approval_history" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."site_visit_cost_submissions"
  WHERE (("site_visit_cost_submissions"."id" = "cost_approval_history"."submission_id") AND ("site_visit_cost_submissions"."submitted_by" = "auth"."uid"())))) OR "public"."is_cost_reviewer"()));



CREATE POLICY "Users can view site visit costs" ON "public"."site_visit_costs" FOR SELECT USING (true);



CREATE POLICY "Users can view site visit costs for their assigned visits" ON "public"."site_visit_costs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."mmp_site_entries" "mse"
  WHERE (("mse"."id" = "site_visit_costs"."site_visit_id") AND (("mse"."monitoring_by" = ( SELECT "profiles"."email"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles"
          WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"text", 'supervisor'::"text", 'fom'::"text", 'financialAdmin'::"text"]))))))))));



CREATE POLICY "Users can view their own call logs" ON "public"."call_logs" FOR SELECT USING ((("auth"."uid"() = "caller_id") OR ("auth"."uid"() = "callee_id")));



CREATE POLICY "Users can view their own incident reports" ON "public"."incident_reports" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own payout requests" ON "public"."payout_requests" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("decided_by" = "auth"."uid"())));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own signatures" ON "public"."handwriting_signatures" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own transactions" ON "public"."wallet_transactions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."wallets"
  WHERE (("wallets"."id" = "wallet_transactions"."wallet_id") AND ("wallets"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own wallet" ON "public"."wallets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own withdrawal requests" ON "public"."withdrawal_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "admin_insert_system_audit_logs" ON "public"."audit_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "admin_select_all_audit_logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_insert_own_audit_logs" ON "public"."audit_logs" FOR INSERT WITH CHECK ((("actor_id" = (( SELECT "auth"."uid"() AS "uid"))::"text") OR ("actor_id" = 'system'::"text")));



CREATE POLICY "authenticated_select_own_audit_logs" ON "public"."audit_logs" FOR SELECT USING (("actor_id" = (( SELECT "auth"."uid"() AS "uid"))::"text"));



ALTER TABLE "public"."budget_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_alerts_all_auth" ON "public"."budget_alerts" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."budget_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_transactions_all_auth" ON "public"."budget_transactions" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."call_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."call_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_message_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_message_reads_insert_self" ON "public"."chat_message_reads" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "chat_message_reads_select_participant" ON "public"."chat_message_reads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."chat_messages" "m"
     JOIN "public"."chat_participants" "cp" ON (("cp"."chat_id" = "m"."chat_id")))
  WHERE (("m"."id" = "chat_message_reads"."message_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "chat_message_reads_update_self" ON "public"."chat_message_reads" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_insert_participant" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "chat_messages_select_participant" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_participants" "cp"
  WHERE (("cp"."chat_id" = "chat_messages"."chat_id") AND ("cp"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_participants_delete_self_or_chat_creator" ON "public"."chat_participants" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_participants"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "chat_participants_insert_self_or_chat_creator" ON "public"."chat_participants" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_participants"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "chat_participants_select_self_or_chat_creator" ON "public"."chat_participants" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_participants"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_delete_creator" ON "public"."chats" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "chats_insert_creator" ON "public"."chats" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "chats_select_all_auth" ON "public"."chats" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "chats_update_creator" ON "public"."chats" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."classification_fee_structures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comprehensive_monitoring_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cost_adjustment_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_adjustment_audit_admin_create" ON "public"."cost_adjustment_audit" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'financialAdmin'::"text", 'ict'::"text"]))))));



CREATE POLICY "cost_adjustment_audit_view" ON "public"."cost_adjustment_audit" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."cost_approval_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dashboard_settings_delete_own" ON "public"."dashboard_settings" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dashboard_settings_insert_own" ON "public"."dashboard_settings" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dashboard_settings_modify_own" ON "public"."dashboard_settings" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dashboard_settings_select_own" ON "public"."dashboard_settings" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dashboard_settings_update_own" ON "public"."dashboard_settings" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."data_visibility_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_visibility_settings_delete_own" ON "public"."data_visibility_settings" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "data_visibility_settings_insert_own" ON "public"."data_visibility_settings" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "data_visibility_settings_modify_own" ON "public"."data_visibility_settings" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "data_visibility_settings_select_own" ON "public"."data_visibility_settings" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "data_visibility_settings_update_own" ON "public"."data_visibility_settings" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."deletion_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deletion_audit_log_insert" ON "public"."deletion_audit_log" FOR INSERT WITH CHECK ("public"."is_super_admin"());



COMMENT ON POLICY "deletion_audit_log_insert" ON "public"."deletion_audit_log" IS 'Only super-admins can create deletion audit log records';



CREATE POLICY "deletion_audit_log_select" ON "public"."deletion_audit_log" FOR SELECT USING (("public"."is_super_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'financialAdmin'::"text", 'ict'::"text"])))))));



COMMENT ON POLICY "deletion_audit_log_select" ON "public"."deletion_audit_log" IS 'Super-admins and admins can view deletion audit logs';



ALTER TABLE "public"."digital_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."down_payment_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "down_payment_requests_admin_all" ON "public"."down_payment_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'financialAdmin'::"text", 'ict'::"text"]))))));



CREATE POLICY "down_payment_requests_admin_delete" ON "public"."down_payment_requests" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))) AND ("status" = 'cancelled'::"text")));



CREATE POLICY "down_payment_requests_supervisor_update" ON "public"."down_payment_requests" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['supervisor'::"text", 'hubSupervisor'::"text"])) AND (("profiles"."hub_id" = "down_payment_requests"."hub_id") OR ("profiles"."hub_id" IS NULL))))) AND ("status" = ANY (ARRAY['pending_supervisor'::"text", 'pending_admin'::"text"]))));



CREATE POLICY "down_payment_requests_supervisor_view" ON "public"."down_payment_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['supervisor'::"text", 'hubSupervisor'::"text"])) AND (("profiles"."hub_id" = "down_payment_requests"."hub_id") OR ("profiles"."hub_id" IS NULL))))));



CREATE POLICY "down_payment_requests_user_create" ON "public"."down_payment_requests" FOR INSERT WITH CHECK ((("requested_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['dataCollector'::"text", 'datacollector'::"text", 'coordinator'::"text"])))))));



CREATE POLICY "down_payment_requests_user_view" ON "public"."down_payment_requests" FOR SELECT USING (("requested_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_insert_public" ON "public"."feedback" FOR INSERT WITH CHECK (true);



CREATE POLICY "feedback_select_admin" ON "public"."feedback" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superAdmin'::"text", 'ictSupport'::"text"]))))));



CREATE POLICY "feedback_select_own" ON "public"."feedback" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (( SELECT "auth"."uid"() AS "uid") IS NULL)));



CREATE POLICY "feedback_update_admin" ON "public"."feedback" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'superAdmin'::"text", 'ictSupport'::"text"]))))));



ALTER TABLE "public"."handwriting_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_site_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hub_states" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hub_states_delete" ON "public"."hub_states" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "hub_states_insert" ON "public"."hub_states" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "hub_states_select" ON "public"."hub_states" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hub_states_update" ON "public"."hub_states" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."hubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hubs_delete" ON "public"."hubs" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "hubs_insert" ON "public"."hubs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "hubs_select" ON "public"."hubs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hubs_update" ON "public"."hubs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."incident_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_logs_insert_own" ON "public"."location_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "location_logs_select_own" ON "public"."location_logs" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "mf_select_authenticated" ON "public"."mmp_files" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "mf_update_editors" ON "public"."mmp_files" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'coordinator'::"text", 'fom'::"text"]))))));



ALTER TABLE "public"."mmp_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmp_budgets_all_auth" ON "public"."mmp_budgets" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."mmp_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmp_files_all_auth" ON "public"."mmp_files" USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



ALTER TABLE "public"."mmp_site_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmp_site_entries_delete" ON "public"."mmp_site_entries" FOR DELETE USING ("public"."is_admin_or_super"());



CREATE POLICY "mmp_site_entries_insert" ON "public"."mmp_site_entries" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "mmp_site_entries_select" ON "public"."mmp_site_entries" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "mmp_site_entries_select_authenticated" ON "public"."mmp_site_entries" FOR SELECT USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "mmp_site_entries_update" ON "public"."mmp_site_entries" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "mmp_site_entries_update_authenticated" ON "public"."mmp_site_entries" FOR UPDATE USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "mse_delete_editors" ON "public"."mmp_site_entries" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'coordinator'::"text", 'fom'::"text"]))))));



CREATE POLICY "mse_insert_editors" ON "public"."mmp_site_entries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'coordinator'::"text", 'fom'::"text"]))))));



CREATE POLICY "mse_select_authenticated" ON "public"."mmp_site_entries" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "mse_update_editors" ON "public"."mmp_site_entries" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'coordinator'::"text", 'fom'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text", 'coordinator'::"text", 'fom'::"text"]))))));



CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE USING ((("recipient_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



COMMENT ON POLICY "notifications_delete_own" ON "public"."notifications" IS 'Users can delete notifications where recipient_id or user_id matches their user ID';



CREATE POLICY "notifications_insert_authenticated" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



COMMENT ON POLICY "notifications_insert_authenticated" ON "public"."notifications" IS 'Any authenticated user can create notifications for any user (allows system notifications)';



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (((("recipient_id" IS NOT NULL) AND ("recipient_id" = "auth"."uid"())) OR (("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())) OR (("entity_type" = ANY (ARRAY['mmpFile'::"text", 'siteVisit'::"text"])) AND ("event_type" = ANY (ARRAY['system'::"text", 'assignments'::"text", 'approvals'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'Admin'::"text", 'super_admin'::"text", 'superAdmin'::"text", 'SuperAdmin'::"text"]))))))));



COMMENT ON POLICY "notifications_select_own" ON "public"."notifications" IS 'Users can view notifications where recipient_id or user_id matches their user ID';



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING ((("recipient_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"()))) WITH CHECK ((("recipient_id" = "auth"."uid"()) OR ("user_id" = "auth"."uid"())));



COMMENT ON POLICY "notifications_update_own" ON "public"."notifications" IS 'Users can update notifications where recipient_id or user_id matches their user ID (e.g., mark as read)';



ALTER TABLE "public"."operational_cost_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."password_reset_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout_delete_admin" ON "public"."payout_requests" FOR DELETE TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "payout_insert_self" ON "public"."payout_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."payout_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout_select" ON "public"."payout_requests" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "payout_update_admin" ON "public"."payout_requests" FOR UPDATE TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "payout_update_self_cancel" ON "public"."payout_requests" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = 'requested'::"public"."payout_status"))) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_modify_admin_only" ON "public"."permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"]))))));



CREATE POLICY "permissions_select_all_auth" ON "public"."permissions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_update" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))) WITH CHECK (true);



CREATE POLICY "profiles_delete_admin" ON "public"."profiles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK (true);



CREATE POLICY "profiles_update_admin_ict" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"]))))))) WITH CHECK ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."project_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_activities_all_auth" ON "public"."project_activities" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."project_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_budgets_all_auth" ON "public"."project_budgets" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."project_scopes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_all_auth" ON "public"."projects" USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



ALTER TABLE "public"."report_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_modify_admin_only" ON "public"."roles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"]))))));



CREATE POLICY "roles_select_all_auth" ON "public"."roles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."safety_checklists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scopes_delete" ON "public"."project_scopes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "scopes_insert" ON "public"."project_scopes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "scopes_select" ON "public"."project_scopes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "scopes_update" ON "public"."project_scopes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."site_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_locations_update" ON "public"."site_locations" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."site_visit_cost_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visit_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sites_delete" ON "public"."sites_registry" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "sites_insert" ON "public"."sites_registry" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."sites_registry" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sites_select" ON "public"."sites_registry" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "sites_update" ON "public"."sites_registry" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sub_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sub_activities_all_auth" ON "public"."sub_activities" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."super_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admins_delete" ON "public"."super_admins" FOR DELETE USING ("public"."is_super_admin"());



COMMENT ON POLICY "super_admins_delete" ON "public"."super_admins" IS 'Only super-admins can delete super-admin records';



CREATE POLICY "super_admins_insert" ON "public"."super_admins" FOR INSERT WITH CHECK ("public"."is_super_admin"());



COMMENT ON POLICY "super_admins_insert" ON "public"."super_admins" IS 'Only existing super-admins can create new super-admin records';



CREATE POLICY "super_admins_select" ON "public"."super_admins" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



COMMENT ON POLICY "super_admins_select" ON "public"."super_admins" IS 'Users can view their own super_admin record, or super-admins can view all records';



CREATE POLICY "super_admins_select_all" ON "public"."super_admins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."super_admins" "sa"
  WHERE (("sa"."user_id" = "auth"."uid"()) AND ("sa"."is_active" = true)))));



CREATE POLICY "super_admins_select_self" ON "public"."super_admins" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "super_admins_update" ON "public"."super_admins" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



COMMENT ON POLICY "super_admins_update" ON "public"."super_admins" IS 'Users can update their own record, or super-admins can update any record';



ALTER TABLE "public"."support_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_budget_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_classifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_modify_admin_ict" ON "public"."user_roles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"]))))));



CREATE POLICY "user_roles_select_any_authenticated" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_roles_select_self_or_admin" ON "public"."user_roles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'ict'::"text"])))))));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_delete_own" ON "public"."user_settings" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_insert_own" ON "public"."user_settings" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_modify_own" ON "public"."user_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_select_own" ON "public"."user_settings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_update_own" ON "public"."user_settings" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."visit_rejections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_balances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_balances_all_auth" ON "public"."wallet_balances" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."wallet_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_settings_delete_own" ON "public"."wallet_settings" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_settings_insert_own" ON "public"."wallet_settings" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_settings_modify_own" ON "public"."wallet_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_settings_select_own" ON "public"."wallet_settings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "wallet_settings_update_own" ON "public"."wallet_settings" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_tx_delete_admin" ON "public"."wallet_transactions" FOR DELETE TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallet_tx_insert_admin" ON "public"."wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallet_tx_insert_earning_self_or_admin" ON "public"."wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK (((("type" = 'earning'::"public"."wallet_tx_type") AND ("user_id" = "auth"."uid"())) OR "public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallet_tx_select" ON "public"."wallet_transactions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallet_tx_update_admin" ON "public"."wallet_transactions" FOR UPDATE TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallets_backup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets_insert_admin" ON "public"."wallets" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallets_select" ON "public"."wallets" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



CREATE POLICY "wallets_update_admin" ON "public"."wallets" FOR UPDATE TO "authenticated" USING (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text"))) WITH CHECK (("public"."has_role"('admin'::"text") OR "public"."has_role"('financialAdmin'::"text")));



ALTER TABLE "public"."withdrawal_requests" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_versions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."budget_alerts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."budget_transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_message_reads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."classification_fee_structures";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comprehensive_monitoring_checklists";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cost_adjustment_audit";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cost_approval_history";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dashboard_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."data_visibility_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deletion_audit_log";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."down_payment_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."equipment";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."feedback";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."handwriting_signatures";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."hub_states";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."hubs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."incident_reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mmp_budgets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mmp_files";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mmp_site_entries";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payout_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."permissions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."project_activities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."project_budgets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."project_scopes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."projects";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."report_photos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."roles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."site_locations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."site_visit_cost_submissions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."site_visit_costs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."site_visits";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sites_registry";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sub_activities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."super_admins";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."task_budgets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_classifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_roles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."visit_rejections";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."visit_status";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_balances";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallets_backup";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."withdrawal_requests";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("path") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."addauth"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_supervisor_to_down_payment_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_supervisor_to_down_payment_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_supervisor_to_down_payment_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_total_cost_submission"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_total_cost_submission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_total_cost_submission"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_hub"("target_hub_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_hub"("target_hub_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_hub"("target_hub_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_submit_operational_costs"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_submit_operational_costs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_submit_operational_costs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_messages_broadcast_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric, "p_total_cost" numeric, "p_classification_level" "text", "p_role_scope" "text", "p_fee_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric, "p_total_cost" numeric, "p_classification_level" "text", "p_role_scope" "text", "p_fee_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_site_visit"("p_site_id" "uuid", "p_user_id" "uuid", "p_enumerator_fee" numeric, "p_total_cost" numeric, "p_classification_level" "text", "p_role_scope" "text", "p_fee_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_wallet_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_wallet_transaction_on_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet_transaction_on_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet_transaction_on_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_super_admin_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_super_admin_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_super_admin_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_fee_on_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_fee_on_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_fee_on_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_default_payment_method"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_payment_method"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_payment_method"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_wallet_row"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_wallet_row"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_wallet_row"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_wallet_credit_on_site_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wallet_credit_on_site_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wallet_credit_on_site_completed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_super_admin_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_super_admin_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_super_admin_count"() TO "service_role";



GRANT ALL ON TABLE "public"."operational_cost_submissions" TO "anon";
GRANT ALL ON TABLE "public"."operational_cost_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_cost_submissions" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_operational_cost_submissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_operational_cost_submissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_operational_cost_submissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classification_fee"("p_classification_level" "public"."classification_level", "p_role_scope" "public"."classification_role_scope", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classification_fee"("p_classification_level" "public"."classification_level", "p_role_scope" "public"."classification_role_scope", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classification_fee"("p_classification_level" "public"."classification_level", "p_role_scope" "public"."classification_role_scope", "p_currency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_feedback_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_feedback_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_feedback_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_roles_with_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_roles_with_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_roles_with_permissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_entry_with_users"("site_entry_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_site_forwarded_details"("site_entry_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_hub_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_hub_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_hub_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "postgres";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "anon";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_mmp_site_entries_cost_acknowledged"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_profile_deleted"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_profile_deleted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_profile_deleted"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("role_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_super"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coordinator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_coordinator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coordinator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_cost_reviewer"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_cost_reviewer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_cost_reviewer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_data_collector"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_data_collector"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_data_collector"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_fom"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_fom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_fom"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_hub_supervisor"("check_hub_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_hub_supervisor"("check_hub_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_hub_supervisor"("check_hub_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_site_forwarded"("site_entry_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_supervisor"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_supervisor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_supervisor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "postgres";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_admins_on_audit_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_admins_on_audit_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_admins_on_audit_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_req_after_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."payout_req_after_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_req_after_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_req_ensure_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."payout_req_ensure_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_req_ensure_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_wallet"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_wallet"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_wallet"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reclaim_site_visit"("p_site_id" "uuid", "p_admin_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_cost_approval_action"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_cost_approval_action"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_cost_approval_action"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_mmp_files_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_mmp_files_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_mmp_files_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_roles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_roles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_roles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_site_location_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_site_location_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_site_location_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_site_visits_fees_on_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_site_visits_fees_on_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_site_visits_fees_on_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_chat_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_chat_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_chat_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_app_versions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_app_versions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_app_versions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_classification_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_classification_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_classification_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_classification_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_classification_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_classification_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_cost_submission_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_cost_submission_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cost_submission_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_down_payment_remaining_amount"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_down_payment_remaining_amount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_down_payment_remaining_amount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_hub_ops_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_hub_ops_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_hub_ops_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_active_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_active_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_active_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_mmp_site_entries_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_mmp_site_entries_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_mmp_site_entries_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_operational_cost_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_operational_cost_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_operational_cost_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_site_visit_costs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_site_visit_costs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_site_visit_costs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_support_tickets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_support_tickets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_support_tickets_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_roles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_roles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_roles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_wallet_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_wallet_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_wallet_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_wallet_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_wallet_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_wallet_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_withdrawal_requests_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_withdrawal_requests_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_withdrawal_requests_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_permission"("user_uuid" "uuid", "check_resource" character varying, "check_action" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_permission"("user_uuid" "uuid", "check_resource" character varying, "check_action" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_permission"("user_uuid" "uuid", "check_resource" character varying, "check_action" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."wallet_tx_after_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."wallet_tx_after_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wallet_tx_after_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wallet_tx_ensure_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."wallet_tx_ensure_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wallet_tx_ensure_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."wallet_tx_set_posted_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."wallet_tx_set_posted_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wallet_tx_set_posted_at"() TO "service_role";












GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "service_role";















GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."budget_alerts" TO "anon";
GRANT ALL ON TABLE "public"."budget_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."budget_transactions" TO "anon";
GRANT ALL ON TABLE "public"."budget_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."call_history" TO "anon";
GRANT ALL ON TABLE "public"."call_history" TO "authenticated";
GRANT ALL ON TABLE "public"."call_history" TO "service_role";



GRANT ALL ON TABLE "public"."call_logs" TO "anon";
GRANT ALL ON TABLE "public"."call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."call_logs" TO "service_role";



GRANT ALL ON TABLE "public"."chat_message_reads" TO "anon";
GRANT ALL ON TABLE "public"."chat_message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_message_reads" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."classification_fee_structures" TO "anon";
GRANT ALL ON TABLE "public"."classification_fee_structures" TO "authenticated";
GRANT ALL ON TABLE "public"."classification_fee_structures" TO "service_role";



GRANT ALL ON TABLE "public"."comprehensive_monitoring_checklists" TO "anon";
GRANT ALL ON TABLE "public"."comprehensive_monitoring_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."comprehensive_monitoring_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."cost_adjustment_audit" TO "anon";
GRANT ALL ON TABLE "public"."cost_adjustment_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_adjustment_audit" TO "service_role";



GRANT ALL ON TABLE "public"."cost_approval_history" TO "anon";
GRANT ALL ON TABLE "public"."cost_approval_history" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_approval_history" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_classifications" TO "anon";
GRANT ALL ON TABLE "public"."user_classifications" TO "authenticated";
GRANT ALL ON TABLE "public"."user_classifications" TO "service_role";



GRANT ALL ON TABLE "public"."current_user_classifications" TO "anon";
GRANT ALL ON TABLE "public"."current_user_classifications" TO "authenticated";
GRANT ALL ON TABLE "public"."current_user_classifications" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_settings" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_settings" TO "service_role";



GRANT ALL ON TABLE "public"."data_visibility_settings" TO "anon";
GRANT ALL ON TABLE "public"."data_visibility_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."data_visibility_settings" TO "service_role";



GRANT ALL ON TABLE "public"."deletion_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."deletion_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."deletion_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."digital_signatures" TO "anon";
GRANT ALL ON TABLE "public"."digital_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."digital_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."down_payment_requests" TO "anon";
GRANT ALL ON TABLE "public"."down_payment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."down_payment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."handwriting_signatures" TO "anon";
GRANT ALL ON TABLE "public"."handwriting_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."handwriting_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."historical_site_costs" TO "anon";
GRANT ALL ON TABLE "public"."historical_site_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_site_costs" TO "service_role";



GRANT ALL ON TABLE "public"."hub_states" TO "anon";
GRANT ALL ON TABLE "public"."hub_states" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_states" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hub_states_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hub_states_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hub_states_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."hubs" TO "anon";
GRANT ALL ON TABLE "public"."hubs" TO "authenticated";
GRANT ALL ON TABLE "public"."hubs" TO "service_role";



GRANT ALL ON TABLE "public"."incident_reports" TO "anon";
GRANT ALL ON TABLE "public"."incident_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_reports" TO "service_role";



GRANT ALL ON TABLE "public"."location_logs" TO "anon";
GRANT ALL ON TABLE "public"."location_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."location_logs" TO "service_role";



GRANT ALL ON TABLE "public"."mmp_budgets" TO "anon";
GRANT ALL ON TABLE "public"."mmp_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."mmp_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."mmp_files" TO "anon";
GRANT ALL ON TABLE "public"."mmp_files" TO "authenticated";
GRANT ALL ON TABLE "public"."mmp_files" TO "service_role";



GRANT ALL ON TABLE "public"."mmp_site_entries" TO "anon";
GRANT ALL ON TABLE "public"."mmp_site_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."mmp_site_entries" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."password_reset_tokens" TO "anon";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."password_reset_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payout_requests" TO "anon";
GRANT ALL ON TABLE "public"."payout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."site_visit_cost_submissions" TO "anon";
GRANT ALL ON TABLE "public"."site_visit_cost_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."site_visit_cost_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."site_visits" TO "anon";
GRANT ALL ON TABLE "public"."site_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."site_visits" TO "service_role";



GRANT ALL ON TABLE "public"."pending_cost_approvals" TO "anon";
GRANT ALL ON TABLE "public"."pending_cost_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_cost_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."project_activities" TO "anon";
GRANT ALL ON TABLE "public"."project_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."project_activities" TO "service_role";



GRANT ALL ON TABLE "public"."project_budgets" TO "anon";
GRANT ALL ON TABLE "public"."project_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."project_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."project_scopes" TO "anon";
GRANT ALL ON TABLE "public"."project_scopes" TO "authenticated";
GRANT ALL ON TABLE "public"."project_scopes" TO "service_role";



GRANT ALL ON TABLE "public"."report_photos" TO "anon";
GRANT ALL ON TABLE "public"."report_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."report_photos" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."safety_checklists" TO "anon";
GRANT ALL ON TABLE "public"."safety_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."safety_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."site_locations" TO "anon";
GRANT ALL ON TABLE "public"."site_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."site_locations" TO "service_role";



GRANT ALL ON TABLE "public"."site_visit_costs" TO "anon";
GRANT ALL ON TABLE "public"."site_visit_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."site_visit_costs" TO "service_role";



GRANT ALL ON TABLE "public"."sites_registry" TO "anon";
GRANT ALL ON TABLE "public"."sites_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."sites_registry" TO "service_role";



GRANT ALL ON TABLE "public"."sub_activities" TO "anon";
GRANT ALL ON TABLE "public"."sub_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_activities" TO "service_role";



GRANT ALL ON TABLE "public"."super_admins" TO "anon";
GRANT ALL ON TABLE "public"."super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."support_contacts" TO "anon";
GRANT ALL ON TABLE "public"."support_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."support_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."task_budget_transactions" TO "anon";
GRANT ALL ON TABLE "public"."task_budget_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_budget_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."task_budgets" TO "anon";
GRANT ALL ON TABLE "public"."task_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."task_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_signatures" TO "anon";
GRANT ALL ON TABLE "public"."user_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."user_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."visit_rejections" TO "anon";
GRANT ALL ON TABLE "public"."visit_rejections" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_rejections" TO "service_role";



GRANT ALL ON TABLE "public"."visit_status" TO "anon";
GRANT ALL ON TABLE "public"."visit_status" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_status" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_balances" TO "anon";
GRANT ALL ON TABLE "public"."wallet_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_balances" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_settings" TO "anon";
GRANT ALL ON TABLE "public"."wallet_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_settings" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



GRANT ALL ON TABLE "public"."wallets_backup" TO "anon";
GRANT ALL ON TABLE "public"."wallets_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets_backup" TO "service_role";



GRANT ALL ON TABLE "public"."withdrawal_requests" TO "anon";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































