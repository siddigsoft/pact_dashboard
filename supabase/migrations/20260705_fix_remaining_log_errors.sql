-- Fix remaining production Postgres log errors:
-- 1. permissions check constraints too narrow vs app RESOURCES/ACTIONS
-- 2. notifications insert RLS still failing for some JWT roles
-- 3. user_activity_logs insert RLS when session expires mid-sync

-- ── permissions: align constraints with app types ─────────────────────────────
ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_action_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_action_check
  CHECK (action = ANY (ARRAY[
    'create', 'read', 'update', 'delete', 'approve', 'assign',
    'archive', 'restore', 'override'
  ]::text[]));

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_resource_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_resource_check
  CHECK (resource = ANY (ARRAY[
    'users', 'roles', 'permissions', 'projects', 'mmp', 'site_visits',
    'finances', 'reports', 'settings', 'super_admins', 'audit_logs',
    'wallets', 'system', 'crm'
  ]::text[]));

-- ── notifications: single permissive insert policy ────────────────────────────
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;

CREATE POLICY notifications_insert_allowed ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'::text
    OR auth.role() = 'authenticated'::text
    OR auth.uid() IS NOT NULL
  );

-- ── user_activity_logs: allow own-row inserts when authenticated ──────────────
DROP POLICY IF EXISTS user_activity_logs_insert_policy ON public.user_activity_logs;

CREATE POLICY user_activity_logs_insert_policy ON public.user_activity_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );
