-- Allow multiple roles per user in user_roles (additional/secondary roles)
-- Previously had UNIQUE(user_id) — now relaxed to UNIQUE(user_id, role)

-- 1. Drop the old single-role-per-user constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS ux_user_roles_user_id;

-- Also try common alternative constraint names
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_key;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_pkey_user_id;

-- 2. Add composite unique so the same role can't be added twice for same user
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS uq_user_roles_user_role;

ALTER TABLE public.user_roles
  ADD CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role);

-- 3. Add hub_id column if not already present (from prior migration)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS hub_id text;

-- 4. Add assigned_by and assigned_at if not present
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();
