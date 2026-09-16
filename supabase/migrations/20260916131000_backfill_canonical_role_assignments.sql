-- Additive backfill: profiles.role + legacy user_roles → canonical assignments.
-- Never deletes existing multi-role rows. Unmatched labels are reported, not invented
-- except for the known built-in `employee` profile value.
BEGIN;

-- Ensure the common profile-only label exists as a real role record.
INSERT INTO public.roles (name, display_name, description, is_system_role, is_active)
SELECT 'employee', 'Employee', 'Default staff role mirrored from profiles.role', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles
  WHERE regexp_replace(lower(name), '[^a-z]', '', 'g') = 'employee'
);

-- 1) Primary profile role → canonical (normalized name match).
INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
SELECT p.id, r.id, p.id, 'Backfilled from profiles.role'
FROM public.profiles p
JOIN public.roles r
  ON r.is_active
 AND regexp_replace(lower(r.name), '[^a-z]', '', 'g')
   = regexp_replace(lower(coalesce(p.role, '')), '[^a-z]', '', 'g')
WHERE nullif(btrim(p.role), '') IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 2) Legacy user_roles.role_id rows → canonical when present.
INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
SELECT ur.user_id, ur.role_id, ur.user_id, 'Backfilled from legacy user_roles.role_id'
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id AND r.is_active
WHERE ur.role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 3) Legacy user_roles.role text → canonical when role_id was null.
INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
SELECT ur.user_id, r.id, ur.user_id, 'Backfilled from legacy user_roles.role text'
FROM public.user_roles ur
JOIN public.roles r
  ON r.is_active
 AND regexp_replace(lower(r.name), '[^a-z]', '', 'g')
   = regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g')
WHERE ur.role_id IS NULL
  AND nullif(btrim(ur.role), '') IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;
