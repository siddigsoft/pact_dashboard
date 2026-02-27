-- Migration: compatibility wrapper for claim_site_visit
-- Purpose: Some clients send RPC parameters in a different order which causes "function not found" errors.
-- This wrapper overload accepts the alternate parameter order and forwards to the canonical implementation.

BEGIN;

-- Create an overloaded wrapper that accepts params in the order some clients send them
-- (p_classification_level, p_enumerator_fee, p_fee_source, p_role_scope, p_site_id, p_total_cost, p_user_id)
CREATE OR REPLACE FUNCTION public.claim_site_visit(
  p_classification_level TEXT,
  p_enumerator_fee NUMERIC,
  p_fee_source TEXT,
  p_role_scope TEXT,
  p_site_id UUID,
  p_total_cost NUMERIC,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sql TEXT;
  v_result JSONB;
  v_enum_exists BOOLEAN;
BEGIN
  -- Detect whether the enum types exist in this database. Use to_regtype so this function
  -- can be created even if the types are absent (we only reference them inside dynamic SQL).
  SELECT to_regtype('public.classification_level') IS NOT NULL
    AND to_regtype('public.classification_role_scope') IS NOT NULL
  INTO v_enum_exists;

  IF v_enum_exists THEN
    v_sql := format(
      'SELECT public.claim_site_visit(%s, %s, %s, %s, %s, %s, %s)',
      quote_literal(p_site_id::text) || '::uuid',
      quote_literal(p_user_id::text) || '::uuid',
      CASE WHEN p_enumerator_fee IS NULL THEN 'NULL' ELSE quote_literal(p_enumerator_fee::text) || '::numeric' END,
      CASE WHEN p_total_cost IS NULL THEN 'NULL' ELSE quote_literal(p_total_cost::text) || '::numeric' END,
      CASE WHEN p_classification_level IS NULL OR p_classification_level = '' THEN 'NULL' ELSE quote_literal(p_classification_level) || '::classification_level' END,
      CASE WHEN p_role_scope IS NULL OR p_role_scope = '' THEN 'NULL' ELSE quote_literal(p_role_scope) || '::classification_role_scope' END,
      quote_literal(p_fee_source) || '::text'
    );
  ELSE
    -- Fallback: call a version that expects TEXT classification/role parameters (older DBs)
    v_sql := format(
      'SELECT public.claim_site_visit(%s, %s, %s, %s, %s, %s, %s)',
      quote_literal(p_site_id::text) || '::uuid',
      quote_literal(p_user_id::text) || '::uuid',
      CASE WHEN p_enumerator_fee IS NULL THEN 'NULL' ELSE quote_literal(p_enumerator_fee::text) || '::numeric' END,
      CASE WHEN p_total_cost IS NULL THEN 'NULL' ELSE quote_literal(p_total_cost::text) || '::numeric' END,
      CASE WHEN p_classification_level IS NULL OR p_classification_level = '' THEN 'NULL' ELSE quote_literal(p_classification_level) || '::text' END,
      CASE WHEN p_role_scope IS NULL OR p_role_scope = '' THEN 'NULL' ELSE quote_literal(p_role_scope) || '::text' END,
      quote_literal(p_fee_source) || '::text'
    );
  END IF;

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated role if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_site_visit(TEXT, NUMERIC, TEXT, TEXT, UUID, NUMERIC, UUID) TO authenticated';
  END IF;
END $$;

-- Additional overload: accept numeric params as TEXT (or unknown at call time) and cast to numeric.
CREATE OR REPLACE FUNCTION public.claim_site_visit(
  p_site_id UUID,
  p_user_id UUID,
  p_enumerator_fee TEXT,
  p_total_cost TEXT,
  p_classification_level TEXT,
  p_role_scope TEXT,
  p_fee_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enumerator_fee NUMERIC := NULL;
  v_total_cost NUMERIC := NULL;
  v_result JSONB;
BEGIN
  IF p_enumerator_fee IS NOT NULL AND p_enumerator_fee <> '' THEN
    v_enumerator_fee := p_enumerator_fee::numeric;
  END IF;
  IF p_total_cost IS NOT NULL AND p_total_cost <> '' THEN
    v_total_cost := p_total_cost::numeric;
  END IF;

  v_result := public.claim_site_visit(
    p_site_id,
    p_user_id,
    v_enumerator_fee,
    v_total_cost,
    p_classification_level,
    p_role_scope,
    p_fee_source
  );

  RETURN v_result;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_site_visit(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated';
  END IF;
END $$;

COMMIT;
