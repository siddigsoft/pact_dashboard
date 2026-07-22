-- ─────────────────────────────────────────────────────────────────────────────
-- Fix user_roles ↔ profiles.role sync
--
-- Problem: The old activation handler only updated profiles.role when a role
-- was changed, leaving stale entries in user_roles. This causes ALL pages that
-- read user_roles (sidebar navigation, permission checks, role badges) to use
-- the old role instead of the current one.
--
-- What this script does (safe, idempotent):
--   1. DIAGNOSTIC: Show every user where profiles.role and user_roles disagree.
--   2. FIX A: Remove stale field-staff user_roles entries for users whose
--             profiles.role is now a management/senior role.
--   3. FIX B: Ensure every user has at least one user_roles row that matches
--             their profiles.role (insert missing rows).
--
-- Run in Supabase SQL Editor. Review Step 1 output before proceeding.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── STEP 1 (DIAGNOSTIC) — Review mismatches before fixing ────────────────────
-- Run this first and review the output. It shows every user where
-- profiles.role and user_roles entries disagree.
SELECT
  p.id,
  p.full_name,
  p.email,
  p.role                                                        AS profiles_role,
  COALESCE(string_agg(ur.role, ', ' ORDER BY ur.assigned_at DESC), '(none)')
                                                                AS user_roles_entries,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role = p.role)
      THEN 'MISSING profiles.role in user_roles'
    WHEN EXISTS    (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role != p.role AND ur2.role IS NOT NULL)
      THEN 'HAS STALE extra role(s)'
    ELSE 'OK'
  END                                                           AS status
FROM   profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role IS NOT NULL
GROUP  BY p.id, p.full_name, p.email, p.role
HAVING
  NOT EXISTS (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role = p.role)
  OR EXISTS  (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role != p.role AND ur2.role IS NOT NULL)
ORDER  BY p.full_name;

-- ── STEP 2A (FIX) — Remove stale field-staff roles for management users ───────
-- Deletes user_roles rows where the role is a field-staff role (dataCollector,
-- coordinator) but profiles.role is already a management/senior role.
-- This is the root cause of "My Sites Management" showing for Admins, wrong
-- sidebar items, and wrong role badges system-wide.
DELETE FROM public.user_roles
WHERE id IN (
  SELECT ur.id
  FROM   public.user_roles ur
  JOIN   public.profiles   p  ON p.id = ur.user_id
  WHERE
    -- User's primary role is now management
    p.role IN (
      'superAdmin', 'admin', 'ict', 'fom', 'countryDirector',
      'financialAdmin', 'projectManager', 'dataTeam', 'auditor',
      'seniorOperationsLead', 'hubSupervisor'
    )
    -- But user_roles still has a stale field-staff entry that differs
    AND ur.role IN ('dataCollector', 'coordinator', 'supervisor')
    AND ur.role IS DISTINCT FROM p.role
);

-- ── STEP 2B (FIX) — Ensure every user has their profiles.role in user_roles ──
-- Inserts a missing user_roles row for any user whose profiles.role is not
-- yet represented in user_roles at all.
INSERT INTO public.user_roles (user_id, role, assigned_at)
SELECT
  p.id,
  p.role,
  NOW()
FROM   public.profiles p
WHERE  p.role IS NOT NULL
  AND  p.role <> ''
  AND  NOT EXISTS (
         SELECT 1 FROM public.user_roles ur
         WHERE  ur.user_id = p.id
           AND  ur.role    = p.role
       )
ON CONFLICT (user_id, role) DO NOTHING;

-- ── STEP 3 (VERIFY) — Confirm everything is now in sync ──────────────────────
-- Should return 0 rows if the fix worked correctly.
SELECT
  p.full_name,
  p.email,
  p.role AS profiles_role,
  string_agg(ur.role, ', ' ORDER BY ur.assigned_at DESC) AS user_roles_entries
FROM   public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IS NOT NULL
GROUP  BY p.full_name, p.email, p.role
HAVING NOT EXISTS (
  SELECT 1 FROM public.user_roles ur2
  WHERE  ur2.user_id = p.id AND ur2.role = p.role
)
ORDER  BY p.full_name;
