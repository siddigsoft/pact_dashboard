-- Migration: Patch get_project_professional_fees() to respect caller visibility
--
-- Problem: The function is defined with SECURITY DEFINER, which means it runs
-- with the function owner's privileges and bypasses RLS entirely.  A restricted-
-- role user (employee, fom, countryDirector, hr) who calls this function via the
-- Supabase API receives fee rows for every project, not just the ones they are
-- allowed to see on the projects table.
--
-- Fix: Replace the function body with one that adds an explicit caller-visibility
-- filter that exactly mirrors the "projects_select" RLS policy introduced in
-- 20260807_projects_rls_member_visibility.sql:
--
--   • Privileged roles (any role NOT in the restricted list) → all rows
--   • Restricted roles (employee, fom, countryDirector, hr) → only rows where
--     the caller is the project manager (projectManagerId), appears in the
--     teamComposition array, or has a row in project_team_members
--
-- The GRANT on the function is kept as-is.

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
    -- ── Caller-visibility guard (mirrors the projects_select RLS policy) ──
    --
    -- Because this function runs as SECURITY DEFINER it bypasses RLS on the
    -- projects table.  We therefore reproduce the same visibility logic here
    -- so that restricted-role callers cannot read fee rows for projects they
    -- are not a member of.
    --
    --   Clause 1: privileged roles see everything.
    --   Clause 2: restricted roles see only their own projects.
    --
    AND (
      -- 1. Caller has a privileged role → unrestricted access.
      --    (Also covers null-role edge-case: NULL NOT IN (...) → NULL → FALSE,
      --    so null-role users fall through to clause 2 and are also denied.)
      EXISTS (
        SELECT 1
        FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
      )

      -- 2. Caller has a restricted role AND is a member of this project.
      OR (
        EXISTS (
          SELECT 1
          FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        AND (
          -- a) Named as project manager by user-ID
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          -- b) Appears in teamComposition array as a userId
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          -- c) Has an explicit active row in project_team_members
          OR EXISTS (
            SELECT 1
            FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active  = TRUE
          )
        )
      )
    )
  ORDER BY p.name, (m->>'name');
$$;

-- Re-assert the GRANT (idempotent — safe to run on an existing grant).
GRANT EXECUTE ON FUNCTION get_project_professional_fees(UUID) TO authenticated;
