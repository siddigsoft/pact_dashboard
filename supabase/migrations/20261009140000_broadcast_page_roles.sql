-- Communication Hub Broadcast tab is now gated by the 'broadcast' page in Access defaults.
-- Keep the roles that previously had hardcoded access (admin, superAdmin, ict, financialAdmin).
UPDATE public.page_role_configs
SET roles = (
  SELECT array_agg(DISTINCT r ORDER BY r)
  FROM unnest(roles || ARRAY['ict', 'financialAdmin']) AS r
)
WHERE page_slug = 'broadcast';
