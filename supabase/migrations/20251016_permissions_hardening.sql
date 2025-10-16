-- Permissions and user_roles schema hardening
-- Safe to re-run

BEGIN;

-- 1) Deduplicate permissions: keep earliest row per (role_id, resource, action)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY role_id, resource, action
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM public.permissions
)
DELETE FROM public.permissions p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) Unique index to support upsert on (role_id, resource, action)
CREATE UNIQUE INDEX IF NOT EXISTS permissions_unique_role_resource_action
  ON public.permissions (role_id, resource, action);

-- 3) Constrain resource and action values to app-known sets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'permissions_resource_check'
  ) THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_resource_check
      CHECK (resource = ANY (ARRAY[
        'users','roles','permissions','projects','mmp','site_visits','finances','reports','settings'
      ])) NOT VALID;
    ALTER TABLE public.permissions VALIDATE CONSTRAINT permissions_resource_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'permissions_action_check'
  ) THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_action_check
      CHECK (action = ANY (ARRAY[
        'create','read','update','delete','approve','assign'
      ])) NOT VALID;
    ALTER TABLE public.permissions VALIDATE CONSTRAINT permissions_action_check;
  END IF;
END $$;

-- 4) Ensure FK cascades so role deletion cleans up permissions
ALTER TABLE public.permissions
  DROP CONSTRAINT IF EXISTS permissions_role_id_fkey;
ALTER TABLE public.permissions
  ADD CONSTRAINT permissions_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

-- 5) user_roles integrity: dedupe and uniqueness/XOR constraints
-- 5a) Dedupe system role assignments (user_id, role)
WITH ranked_sys AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, role
           ORDER BY assigned_at NULLS LAST, created_at NULLS LAST, id
         ) AS rn
  FROM public.user_roles
  WHERE role IS NOT NULL
)
DELETE FROM public.user_roles ur
USING ranked_sys r
WHERE ur.id = r.id AND r.rn > 1;

-- 5b) Dedupe custom role assignments (user_id, role_id)
WITH ranked_custom AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, role_id
           ORDER BY assigned_at NULLS LAST, created_at NULLS LAST, id
         ) AS rn
  FROM public.user_roles
  WHERE role_id IS NOT NULL
)
DELETE FROM public.user_roles ur
USING ranked_custom r
WHERE ur.id = r.id AND r.rn > 1;

-- 5c) Enforce XOR: exactly one of role or role_id must be set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_roles_role_xor_check'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_role_xor_check
      CHECK (((role IS NOT NULL)::int + (role_id IS NOT NULL)::int) = 1);
  END IF;
END $$;

-- 5d) Unique constraints to prevent duplicates going forward
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_user_role
  ON public.user_roles(user_id, role)
  WHERE role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_user_role_id
  ON public.user_roles(user_id, role_id)
  WHERE role_id IS NOT NULL;

COMMIT;
