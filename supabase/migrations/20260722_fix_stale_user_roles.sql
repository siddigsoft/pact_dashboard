-- ============================================================
-- FIX: Stale dataCollector entries in user_roles
-- Run each block separately in Supabase SQL Editor
-- Safe to re-run — UPDATE only changes rows that are wrong
-- ============================================================

-- ── STEP 1: DIAGNOSTIC — see who is affected ────────────────
-- Run this first (read-only, no changes).

SELECT
  p.id,
  p.full_name,
  p.email,
  p.role            AS profile_role,
  ur.role           AS user_roles_role
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'dataCollector'
  AND p.role IS NOT NULL
  AND p.role <> ''
  AND lower(p.role) NOT IN ('datacollector', 'data_collector')
ORDER BY p.full_name;


-- ── STEP 2: FIX — update the stale rows in place ────────────
-- Changes user_roles.role from 'dataCollector' → profiles.role
-- for every user whose real role is something higher.
-- No delete/insert needed — just update the existing row.

UPDATE user_roles ur
SET role = p.role
FROM profiles p
WHERE ur.user_id = p.id
  AND ur.role = 'dataCollector'
  AND p.role IS NOT NULL
  AND p.role <> ''
  AND lower(p.role) NOT IN ('datacollector', 'data_collector');


-- ── STEP 3: ADD missing rows for users with no user_roles entry
-- Some users may have a profiles.role but no row in user_roles at all.

INSERT INTO user_roles (user_id, role)
SELECT p.id, p.role
FROM profiles p
WHERE p.role IS NOT NULL
  AND p.role <> ''
  AND lower(p.role) NOT IN ('datacollector', 'data_collector')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
  );


-- ── STEP 4: VERIFY — confirm everything looks right ─────────

SELECT
  p.full_name,
  p.email,
  p.role            AS profile_role,
  ur.role           AS user_roles_role,
  CASE WHEN lower(p.role) = lower(ur.role) THEN '✓ OK' ELSE '✗ MISMATCH' END AS status
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
ORDER BY status DESC, p.full_name;
