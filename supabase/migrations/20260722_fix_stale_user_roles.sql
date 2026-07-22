-- ============================================================
-- FIX: Stale dataCollector entries in user_roles
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to re-run — uses IF NOT EXISTS / DELETE only where stale
-- ============================================================

-- ── STEP 1: DIAGNOSTIC ──────────────────────────────────────
-- Run this first to SEE which users are affected before fixing.
-- Comment out or skip this block after reviewing.

SELECT
  p.id,
  p.full_name,
  p.email,
  p.role                         AS profile_role,
  string_agg(ur.role, ', ')      AS user_roles_entries
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'dataCollector'
  AND p.role IS NOT NULL
  AND p.role <> ''
  AND lower(p.role) NOT IN ('datacollector', 'data_collector')
GROUP BY p.id, p.full_name, p.email, p.role
ORDER BY p.full_name;


-- ── STEP 2: DELETE stale dataCollector entries ──────────────
-- Removes the wrong dataCollector row from user_roles
-- for any user whose profiles.role is something higher.

DELETE FROM user_roles
WHERE id IN (
  SELECT ur.id
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  WHERE ur.role = 'dataCollector'
    AND p.role IS NOT NULL
    AND p.role <> ''
    AND lower(p.role) NOT IN ('datacollector', 'data_collector')
);


-- ── STEP 3: INSERT correct role from profiles ───────────────
-- Adds the real role (from profiles) into user_roles
-- only for users who don't already have it.

INSERT INTO user_roles (user_id, role)
SELECT p.id, p.role
FROM profiles p
WHERE p.role IS NOT NULL
  AND p.role <> ''
  AND lower(p.role) NOT IN ('datacollector', 'data_collector')
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = p.role
  );


-- ── STEP 4: VERIFY ──────────────────────────────────────────
-- Run this after the fix to confirm everything looks correct.

SELECT
  p.full_name,
  p.email,
  p.role            AS profile_role,
  ur.role           AS user_roles_role
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
ORDER BY p.full_name;
