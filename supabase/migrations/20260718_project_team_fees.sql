-- ============================================================
-- Project Team Fees Migration
-- Adds fee tracking fields to the project team JSONB column.
-- The team composition is stored as a JSONB array inside
-- the `projects.team` column — no schema change is required
-- for the new fee fields (memberType, feeType, rate,
-- plannedHours, currency, paymentDueDate, paymentStatus,
-- amountPaid) since they are stored inside the JSON.
--
-- This migration adds a DB-level view + helper function to
-- expose professional fees as a queryable table for reporting.
-- ============================================================

-- Helper function: expand team_composition fee rows per project
CREATE OR REPLACE FUNCTION get_project_professional_fees(p_project_id UUID DEFAULT NULL)
RETURNS TABLE (
  project_id        UUID,
  project_name      TEXT,
  user_id           TEXT,
  member_name       TEXT,
  role              TEXT,
  member_type       TEXT,
  fee_type          TEXT,
  rate              NUMERIC,
  planned_hours     NUMERIC,
  currency          TEXT,
  total_fee         NUMERIC,
  amount_paid       NUMERIC,
  outstanding       NUMERIC,
  payment_status    TEXT,
  payment_due_date  DATE,
  joined_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id                                                  AS project_id,
    p.name                                                AS project_name,
    (m->>'userId')                                        AS user_id,
    (m->>'name')                                          AS member_name,
    (m->>'role')                                          AS role,
    COALESCE(m->>'memberType', 'internal')                AS member_type,
    (m->>'feeType')                                       AS fee_type,
    COALESCE((m->>'rate')::NUMERIC, 0)                    AS rate,
    COALESCE((m->>'plannedHours')::NUMERIC, 0)            AS planned_hours,
    COALESCE(m->>'currency', 'SDG')                       AS currency,
    CASE
      WHEN m->>'feeType' = 'per_hour'
        THEN COALESCE((m->>'rate')::NUMERIC, 0) * COALESCE((m->>'plannedHours')::NUMERIC, 0)
      WHEN m->>'feeType' = 'fixed_fee'
        THEN COALESCE((m->>'rate')::NUMERIC, 0)
      WHEN m->>'feeType' = 'percent_budget'
        THEN COALESCE(((p.team->>'total')::NUMERIC), 0) * COALESCE((m->>'rate')::NUMERIC, 0) / 100
      ELSE 0
    END                                                   AS total_fee,
    COALESCE((m->>'amountPaid')::NUMERIC, 0)              AS amount_paid,
    GREATEST(0,
      CASE
        WHEN m->>'feeType' = 'per_hour'
          THEN COALESCE((m->>'rate')::NUMERIC, 0) * COALESCE((m->>'plannedHours')::NUMERIC, 0)
        WHEN m->>'feeType' = 'fixed_fee'
          THEN COALESCE((m->>'rate')::NUMERIC, 0)
        WHEN m->>'feeType' = 'percent_budget'
          THEN COALESCE(((p.team->>'total')::NUMERIC), 0) * COALESCE((m->>'rate')::NUMERIC, 0) / 100
        ELSE 0
      END - COALESCE((m->>'amountPaid')::NUMERIC, 0)
    )                                                     AS outstanding,
    COALESCE(m->>'paymentStatus', 'unpaid')               AS payment_status,
    NULLIF(m->>'paymentDueDate', '')::DATE                AS payment_due_date,
    NULLIF(m->>'joinedAt', '')::TIMESTAMPTZ               AS joined_at
  FROM projects p,
       jsonb_array_elements(
         CASE
           WHEN p.team ? 'teamComposition'
             THEN p.team->'teamComposition'
           ELSE '[]'::jsonb
         END
       ) AS m
  WHERE
    (m->>'feeType') IS NOT NULL
    AND (p_project_id IS NULL OR p.id = p_project_id)
  ORDER BY p.name, (m->>'name');
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_project_professional_fees(UUID) TO authenticated;

-- ============================================================
-- HOW TO USE:
--   Run this SQL in your Supabase SQL editor.
--   Then query:
--     SELECT * FROM get_project_professional_fees();          -- all projects
--     SELECT * FROM get_project_professional_fees('<uuid>');  -- one project
-- ============================================================
