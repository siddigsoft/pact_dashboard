-- Task #518: Let Finance dismiss/resolve GL bridge error rows from the log panel
-- Adds two nullable columns to acct_gl_bridge_log so Finance can mark a known
-- error as "resolved" without it continuing to appear in dashboards.

ALTER TABLE acct_gl_bridge_log
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by  uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for the Finance Dashboard 24h query (already filters on status & created_at,
-- but adding resolved_at here lets Postgres prune the IS NULL arm cheaply).
CREATE INDEX IF NOT EXISTS idx_gl_bridge_log_unresolved_errors
  ON acct_gl_bridge_log (status, created_at DESC)
  WHERE resolved_at IS NULL;

-- Grant column-level UPDATE to authenticated (RLS policy below enforces who may actually do it).
GRANT UPDATE (resolved_at, resolved_by) ON acct_gl_bridge_log TO authenticated;

-- RLS: only Finance/Admin roles may mark error rows resolved.
-- USING  — limits which rows the UPDATE may target (must be an error row, not already resolved).
-- WITH CHECK — ensures the client cannot impersonate another user as resolver and cannot
--              clear resolved_at once set (resolved_at must be non-null and resolved_by
--              must match the caller's own auth.uid()).
DROP POLICY IF EXISTS bridge_log_resolve ON public.acct_gl_bridge_log;
CREATE POLICY bridge_log_resolve ON public.acct_gl_bridge_log
  FOR UPDATE TO authenticated
  USING (
    -- Caller must be an authorised Finance/Admin role
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND lower(role) IN ('super_admin','superadmin','admin','finance',
                             'financialadmin','accountant')
    )
    -- Only error rows can be resolved
    AND status = 'error'
  )
  WITH CHECK (
    -- Resolver must record themselves (prevents impersonation)
    resolved_by = auth.uid()
    -- resolved_at must be provided (prevents accidentally clearing it)
    AND resolved_at IS NOT NULL
  );
