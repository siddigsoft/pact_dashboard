-- =============================================================================
-- Cycle Reopen — Super Admin only
-- Date: 2026-08-18
--
-- 1. Adds reopen audit columns to mmp_files
-- 2. Expands the cycle_status check constraint to include 'in_progress' and 're_opening'
-- 3. Creates reopen_cycle() RPC — Super Admin only, enforced server-side
-- Safe to re-run: DROP IF EXISTS / CREATE OR REPLACE throughout
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mmp_files — reopen audit trail
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS cycle_reopened_at    timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_reopened_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_reopen_reason  text,
  ADD COLUMN IF NOT EXISTS cycle_reopen_count   int NOT NULL DEFAULT 0;   -- audit: how many times this cycle was reopened

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Expand cycle_status check constraint
--    Previous: ('active', 'closing', 'pending_approval', 'closed')
--    New:      adds 'in_progress' (used while wizard is open) and 'reopened'
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mmp_files
  DROP CONSTRAINT IF EXISTS mmp_files_cycle_status_check;

ALTER TABLE public.mmp_files
  ADD CONSTRAINT mmp_files_cycle_status_check
  CHECK (cycle_status IN ('active', 'closing', 'in_progress', 'pending_approval', 'closed', 'reopened'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC — reopen_cycle(p_mmp_id, p_reason)
--    • Enforces Super Admin role server-side via auth.uid() → profiles.role
--    • Sets cycle_status → 'reopened', clears cycle_closed_at
--    • Increments cycle_reopen_count
--    • Returns the updated row as JSON
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reopen_cycle(
  p_mmp_id uuid,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_mmp         public.mmp_files%ROWTYPE;
  v_now         timestamptz := now();
BEGIN
  -- ── 1. Role guard (Super Admin only) ──────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM   public.profiles
  WHERE  id = auth.uid();

  IF v_caller_role NOT IN ('super_admin', 'SuperAdmin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only Super Admin can reopen a closed cycle.';
  END IF;

  -- ── 2. Validate MMP exists and is closed ──────────────────────────────────
  SELECT * INTO v_mmp FROM public.mmp_files WHERE id = p_mmp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: MMP % does not exist.', p_mmp_id;
  END IF;

  IF v_mmp.cycle_status != 'closed' THEN
    RAISE EXCEPTION 'INVALID_STATE: Cycle is not closed (current status: %). Only closed cycles can be reopened.', v_mmp.cycle_status;
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'VALIDATION: A reopen reason is required.';
  END IF;

  -- ── 3. Reopen ─────────────────────────────────────────────────────────────
  UPDATE public.mmp_files SET
    cycle_status        = 'reopened',
    cycle_closed_at     = NULL,
    cycle_reopened_at   = v_now,
    cycle_reopened_by   = auth.uid(),
    cycle_reopen_reason = trim(p_reason),
    cycle_reopen_count  = COALESCE(cycle_reopen_count, 0) + 1
  WHERE id = p_mmp_id;

  -- ── 4. Return audit record ────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'mmp_id',         p_mmp_id,
    'reopened_at',    v_now,
    'reopened_by',    auth.uid(),
    'reopen_count',   v_mmp.cycle_reopen_count + 1,
    'previous_status', v_mmp.cycle_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_cycle(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reopen_cycle IS
  'Super Admin only. Reopens a closed MMP cycle so Finance can make corrections before re-closing. '
  'Does not roll back GL entries — corrections use journal entries. '
  'Full audit trail: reopened_at, reopened_by, reopen_reason, reopen_count.';

COMMIT;
