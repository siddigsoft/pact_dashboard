-- Idempotent — safe to run multiple times.
-- Allows multiple roles per user in user_roles (drops per-user unique, adds per-user+role unique).

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS ux_user_roles_user_id;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS uq_user_roles_user_role;
ALTER TABLE public.user_roles ADD CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS hub_id text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();
