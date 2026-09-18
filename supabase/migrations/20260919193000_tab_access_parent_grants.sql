-- Tab access depends on the role-tab baseline and on its parent hub page.
-- This is intentionally a new migration: deployed access migrations remain
-- immutable.

CREATE TABLE IF NOT EXISTS public.role_tab_configs (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  page_slug text NOT NULL CHECK (page_slug LIKE '%:%'),
  is_blocked boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, page_slug)
);

ALTER TABLE public.role_tab_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_tab_read ON public.role_tab_configs;
CREATE POLICY role_tab_read ON public.role_tab_configs
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.role_tab_configs FROM anon, authenticated;
GRANT SELECT ON public.role_tab_configs TO authenticated;

-- Canonical source: src/lib/hub-tab-defs.ts / ACCESS_TARGET_REGISTRY.
-- The accounting UI stores legacy `accounting:*` keys, while its page slug is
-- `accounting-hub`; every other hub uses the same parent slug in both places.
CREATE TABLE IF NOT EXISTS public.access_tab_registry (
  hub_slug text PRIMARY KEY,
  parent_page_slug text NOT NULL,
  tab_ids text[] NOT NULL CHECK (cardinality(tab_ids) > 0),
  CHECK (hub_slug <> '' AND parent_page_slug <> '')
);
ALTER TABLE public.access_tab_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_tab_registry_read ON public.access_tab_registry;
CREATE POLICY access_tab_registry_read ON public.access_tab_registry
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.access_tab_registry FROM anon, authenticated;
GRANT SELECT ON public.access_tab_registry TO authenticated;

INSERT INTO public.access_tab_registry (hub_slug, parent_page_slug, tab_ids)
VALUES
  ('field-ops', 'field-ops', ARRAY['site-visits','monitoring-form','coverage-map','safety-hub','incident-reports','equipment','field-team','map','field-operation-manager']),
  ('field-data', 'field-data', ARRAY['forms','datasets','sampling','studies','quality','monitoring','cases','workflow','exports','languages','collaboration','backup','api','notifications']),
  ('crm', 'crm', ARRAY['dashboard','partners','contacts','engagements','pipeline']),
  ('down-payment-approval', 'down-payment-approval', ARRAY['approval','byState','byProject','byMMP','allRequests','disbursement','coverage']),
  ('admin-hub', 'admin-hub', ARRAY['users','role-management','page-access','departments','hub-management','classifications','classification-fees','task-admin','project-flow-stages','settings','audit-compliance','system-monitoring']),
  ('super-admin-hub', 'super-admin-hub', ARRAY['super-admin','system-monitoring','cycle-health','approval-dashboard','roles','user-access','audit-logs','button-registry','email-tracking','email-management','email-preview','mobile-help-articles','mobile-signatures','mobile-call-scheduling','mobile-document-sync','transaction-scanner','data-management']),
  ('finance-hub', 'finance-hub', ARRAY['budget','financial-ops','admin-wallets','reconciliation','subscriptions','campaign-advances','wallet-reports','advance-report','duplicate-payments','cost-predictions','exchange-rates','salary-retainer','month-end','enumerator-fees']),
  ('hr-hub', 'hr-hub', ARRAY['payroll','payroll-admin','retainer','eosb','salary-advances','salary-increments','field-wallet','payroll-summary','comp-bands','compliance-reports','timesheet','leave-requests','leave-calendar','employees','positions','onboarding','offboarding','recruitment','disciplinary','org-chart','benefits','headcount','equipment','policy-library','overview','hr-analytics','pay-equity','wa-broadcast','pulse-surveys']),
  ('mmp', 'mmp', ARRAY['enumerator','new','forwarded','verified','tracker','adhoc','village-campaigns']),
  ('pre-funding', 'pre-funding', ARRAY['overview','registry','approvals','reconciliation','allocations','settings','report','distribute']),
  ('accounting', 'accounting-hub', ARRAY['finance-dashboard','coa','companies','journals','journal-items','trial-balance','ledger','reports','fiscal-years','search','recurring-journals','journal-templates','opening-balances','bank-recon','budget-planning','budget-variance','cash-flow','fixed-assets','gl-bridge','gl-bridge-settings','gl-bridge-prefunding','gl-bridge-payroll','annual-budget','bank-statement-import','unified-assets','loans','deferred-items','depreciation-schedule','customer-invoices','customer-payments','wire-transfers','petty-cash','outstanding-checks','ar-aging','asset-revaluation','vendors','purchase-requisitions','purchase-orders','grn','ap-invoices','cheque-register','ap-aging','payment-terms','follow-up-levels','aged-receivable','partner-ledger','expense-reports','expense-categories','per-diem-rates','period-close','tax','multi-currency','budget-encumbrance','donor-reports','sod','aml','intercompany','funds','fiscal-positions','lock-dates','analytic-plans','withholding-tax','tax-return','cash-flow-forecast','grants','cost-allocation','depreciation-run','consolidation','gl-audit','finance-audit-trail','settings','pl-by-department','budget-utilization','kpi-ratios','donor-statement','bs-comparison','unrealized-gl','analytic-report','project-links'])
ON CONFLICT (hub_slug) DO UPDATE
SET parent_page_slug = EXCLUDED.parent_page_slug, tab_ids = EXCLUDED.tab_ids;

-- A tab grant without a parent grant is not reachable from navigation. Preserve
-- explicit parent blocks, but make existing active tab grants usable. Join
-- the registry before ranking and rank by parent (not tab), because sibling
-- grants share one parent conflict target. A permanent active tab grant wins;
-- otherwise the farthest expiry and latest row win deterministically.
WITH valid_tabs AS (
  SELECT tab.*, r.parent_page_slug,
    row_number() OVER (
      PARTITION BY tab.user_id, r.parent_page_slug
      ORDER BY (tab.expires_at IS NULL) DESC, tab.expires_at DESC NULLS LAST,
               tab.created_at DESC NULLS LAST, tab.id DESC
    ) AS rn
  FROM public.page_access_overrides tab
  JOIN public.access_tab_registry r
    ON split_part(tab.page_slug, ':', 1) = r.hub_slug
   AND split_part(tab.page_slug, ':', 2) = ANY(r.tab_ids)
  WHERE tab.page_slug ~ '^[^:]+:[^:]+$'
    AND tab.is_blocked IS FALSE
    AND (tab.expires_at IS NULL OR tab.expires_at > now())
), chosen_tabs AS (
  SELECT * FROM valid_tabs WHERE rn = 1
)
INSERT INTO public.page_access_overrides
  (user_id, page_slug, is_blocked, level, reason, expires_at,
   granted_by, approved_by, approved_at)
SELECT
  tab.user_id,
  tab.parent_page_slug,
  false,
  tab.level,
  'Parent page enabled by an existing tab grant.',
  tab.expires_at,
  tab.granted_by,
  tab.approved_by,
  tab.approved_at
FROM chosen_tabs tab
WHERE NOT EXISTS (
    SELECT 1
    FROM public.page_access_overrides parent
    WHERE parent.user_id = tab.user_id
      AND parent.page_slug = tab.parent_page_slug
      AND parent.is_blocked IS TRUE
      AND (parent.expires_at IS NULL OR parent.expires_at > now())
   )
ON CONFLICT (user_id, page_slug) DO UPDATE
SET is_blocked = false,
    level = EXCLUDED.level,
    reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at,
    granted_by = EXCLUDED.granted_by,
    approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at
WHERE public.page_access_overrides.expires_at IS NOT NULL
      AND public.page_access_overrides.expires_at <= now();

CREATE OR REPLACE FUNCTION public.toggle_user_tab_access(
  p_target_user_id uuid,
  p_tab_slug text,
  p_intent text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_parent text;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Not authorized to manage tab access.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND public.is_super_admin(id)
  ) THEN
    RAISE EXCEPTION 'Super Admin targets cannot receive access overrides.' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id IS NULL
     OR nullif(btrim(p_tab_slug), '') IS NULL
     OR btrim(p_tab_slug) !~ '^[^:]+:[^:]+$'
     OR p_intent NOT IN ('grant', 'block', 'clear') THEN
    RAISE EXCEPTION 'A valid hub tab and access intent are required.' USING ERRCODE = '22023';
  END IF;
  SELECT r.parent_page_slug INTO v_parent
  FROM public.access_tab_registry r
  WHERE split_part(btrim(p_tab_slug), ':', 1) = r.hub_slug
    AND split_part(btrim(p_tab_slug), ':', 2) = ANY(r.tab_ids);
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Unknown canonical hub tab: %', btrim(p_tab_slug)
      USING ERRCODE = '22023';
  END IF;

  IF p_intent = 'grant' AND EXISTS (
    SELECT 1 FROM public.page_access_overrides
    WHERE user_id = p_target_user_id
      AND page_slug = v_parent
      AND is_blocked IS TRUE
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RAISE EXCEPTION 'The parent hub page is explicitly blocked. Grant the parent page before granting this tab.'
      USING ERRCODE = '42501';
  END IF;

  IF p_intent = 'clear' THEN
    DELETE FROM public.page_access_overrides
    WHERE user_id = p_target_user_id AND page_slug = btrim(p_tab_slug);
  ELSIF p_intent = 'block' THEN
    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, btrim(p_tab_slug), true, 'view', NULL, NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = true,
          level = 'view',
          reason = NULL,
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;
  ELSE
    -- The parent insert and tab upsert are one transaction. Existing explicit
    -- parent grants retain their metadata; trigger attribution audits changes.
    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, v_parent, false, 'view',
            'Parent page enabled by tab grant.', NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = false,
          level = 'view',
          reason = 'Parent page enabled by tab grant.',
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;

    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, btrim(p_tab_slug), false, 'view', NULL, NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = false,
          level = 'view',
          reason = NULL,
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'tab_slug', btrim(p_tab_slug),
    'parent_slug', v_parent,
    'intent', p_intent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_user_tab_access(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_user_tab_access(uuid, text, text)
  TO authenticated;

-- Refresh the canonical access manifest after ensuring its role-tab dependency
-- exists. This keeps appointed Super Admins, multi-role tab blocking, user
-- overrides, action overrides, and role permissions in one snapshot.
CREATE OR REPLACE FUNCTION public.get_current_user_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH caller AS (SELECT auth.uid() AS user_id),
  assigned_roles AS (
    SELECT DISTINCT r.name::text AS role_name
    FROM public.canonical_user_role_assignments a
    JOIN caller c ON c.user_id = a.user_id
    JOIN public.roles r ON r.id = a.role_id AND r.is_active
    UNION
    SELECT 'superAdmin'::text FROM caller c
    WHERE c.user_id IS NOT NULL AND public.is_super_admin(c.user_id)
  ),
  tab_configs AS (
    SELECT coalesce(jsonb_object_agg(tab.page_slug, tab.is_blocked), '{}'::jsonb) AS value
    FROM (
      SELECT rtc.page_slug,
        count(DISTINCT rtc.role_id) FILTER (WHERE rtc.is_blocked) = (
          SELECT count(*) FROM public.canonical_user_role_assignments a
          JOIN caller c ON c.user_id = a.user_id
          JOIN public.roles r ON r.id = a.role_id AND r.is_active
        ) AS is_blocked
      FROM public.role_tab_configs rtc
      JOIN public.canonical_user_role_assignments a ON a.role_id = rtc.role_id
      JOIN caller c ON c.user_id = a.user_id
      JOIN public.roles r ON r.id = a.role_id AND r.is_active
      GROUP BY rtc.page_slug
    ) tab
  ),
  page_configs AS (
    SELECT coalesce(jsonb_object_agg(page_slug, to_jsonb(roles)), '{}'::jsonb) AS value
    FROM public.page_role_configs
  ),
  page_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      pao.page_slug, jsonb_build_object(
        'is_blocked', pao.is_blocked, 'notes', pao.notes,
        'reason', pao.reason, 'expires_at', pao.expires_at
      )), '{}'::jsonb) AS value
    FROM public.page_access_overrides pao
    JOIN caller c ON c.user_id = pao.user_id
    WHERE pao.expires_at IS NULL OR pao.expires_at > now()
  ),
  action_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      upo.resource || ':' || upo.action, jsonb_build_object(
        'is_granted', upo.is_granted, 'expires_at', upo.expires_at,
        'reason', upo.reason
      )), '{}'::jsonb) AS value
    FROM public.user_permission_overrides upo
    JOIN caller c ON c.user_id = upo.user_id
    WHERE upo.expires_at IS NULL OR upo.expires_at > now()
  ),
  role_permissions AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('resource', permission.resource, 'action', permission.action)
      ORDER BY permission.resource, permission.action
    ), '[]'::jsonb) AS value
    FROM public.get_user_permissions((SELECT user_id FROM caller)) permission
  )
  SELECT jsonb_build_object(
    'user_id', (SELECT user_id FROM caller),
    'roles', coalesce((SELECT jsonb_agg(role_name ORDER BY role_name) FROM assigned_roles), '[]'::jsonb),
    'page_role_configs', (SELECT value FROM page_configs),
    'role_tab_blocks', (SELECT value FROM tab_configs),
    'page_overrides', (SELECT value FROM page_overrides),
    'action_overrides', (SELECT value FROM action_overrides),
    'role_permissions', (SELECT value FROM role_permissions),
    'generated_at', now()
  );
$function$;

REVOKE ALL ON FUNCTION public.get_current_user_access_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_access_context() TO authenticated;
NOTIFY pgrst, 'reload schema';-- Tab access depends on the role-tab baseline and on its parent hub page.
-- This is intentionally a new migration: deployed access migrations remain
-- immutable.

CREATE TABLE IF NOT EXISTS public.role_tab_configs (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  page_slug text NOT NULL CHECK (page_slug LIKE '%:%'),
  is_blocked boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, page_slug)
);

ALTER TABLE public.role_tab_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_tab_read ON public.role_tab_configs;
CREATE POLICY role_tab_read ON public.role_tab_configs
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.role_tab_configs FROM anon, authenticated;
GRANT SELECT ON public.role_tab_configs TO authenticated;

-- Canonical source: src/lib/hub-tab-defs.ts / ACCESS_TARGET_REGISTRY.
-- The accounting UI stores legacy `accounting:*` keys, while its page slug is
-- `accounting-hub`; every other hub uses the same parent slug in both places.
CREATE TABLE IF NOT EXISTS public.access_tab_registry (
  hub_slug text PRIMARY KEY,
  parent_page_slug text NOT NULL,
  tab_ids text[] NOT NULL CHECK (cardinality(tab_ids) > 0),
  CHECK (hub_slug <> '' AND parent_page_slug <> '')
);
ALTER TABLE public.access_tab_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_tab_registry_read ON public.access_tab_registry;
CREATE POLICY access_tab_registry_read ON public.access_tab_registry
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.access_tab_registry FROM anon, authenticated;
GRANT SELECT ON public.access_tab_registry TO authenticated;

INSERT INTO public.access_tab_registry (hub_slug, parent_page_slug, tab_ids)
VALUES
  ('field-ops', 'field-ops', ARRAY['site-visits','monitoring-form','coverage-map','safety-hub','incident-reports','equipment','field-team','map','field-operation-manager']),
  ('field-data', 'field-data', ARRAY['forms','datasets','sampling','studies','quality','monitoring','cases','workflow','exports','languages','collaboration','backup','api','notifications']),
  ('crm', 'crm', ARRAY['dashboard','partners','contacts','engagements','pipeline']),
  ('down-payment-approval', 'down-payment-approval', ARRAY['approval','byState','byProject','byMMP','allRequests','disbursement','coverage']),
  ('admin-hub', 'admin-hub', ARRAY['users','role-management','page-access','departments','hub-management','classifications','classification-fees','task-admin','project-flow-stages','settings','audit-compliance','system-monitoring']),
  ('super-admin-hub', 'super-admin-hub', ARRAY['super-admin','system-monitoring','cycle-health','approval-dashboard','roles','user-access','audit-logs','button-registry','email-tracking','email-management','email-preview','mobile-help-articles','mobile-signatures','mobile-call-scheduling','mobile-document-sync','transaction-scanner','data-management']),
  ('finance-hub', 'finance-hub', ARRAY['budget','financial-ops','admin-wallets','reconciliation','subscriptions','campaign-advances','wallet-reports','advance-report','duplicate-payments','cost-predictions','exchange-rates','salary-retainer','month-end','enumerator-fees']),
  ('hr-hub', 'hr-hub', ARRAY['payroll','payroll-admin','retainer','eosb','salary-advances','salary-increments','field-wallet','payroll-summary','comp-bands','compliance-reports','timesheet','leave-requests','leave-calendar','employees','positions','onboarding','offboarding','recruitment','disciplinary','org-chart','benefits','headcount','equipment','policy-library','overview','hr-analytics','pay-equity','wa-broadcast','pulse-surveys']),
  ('mmp', 'mmp', ARRAY['enumerator','new','forwarded','verified','tracker','adhoc','village-campaigns']),
  ('pre-funding', 'pre-funding', ARRAY['overview','registry','approvals','reconciliation','allocations','settings','report','distribute']),
  ('accounting', 'accounting-hub', ARRAY['finance-dashboard','coa','companies','journals','journal-items','trial-balance','ledger','reports','fiscal-years','search','recurring-journals','journal-templates','opening-balances','bank-recon','budget-planning','budget-variance','cash-flow','fixed-assets','gl-bridge','gl-bridge-settings','gl-bridge-prefunding','gl-bridge-payroll','annual-budget','bank-statement-import','unified-assets','loans','deferred-items','depreciation-schedule','customer-invoices','customer-payments','wire-transfers','petty-cash','outstanding-checks','ar-aging','asset-revaluation','vendors','purchase-requisitions','purchase-orders','grn','ap-invoices','cheque-register','ap-aging','payment-terms','follow-up-levels','aged-receivable','partner-ledger','expense-reports','expense-categories','per-diem-rates','period-close','tax','multi-currency','budget-encumbrance','donor-reports','sod','aml','intercompany','funds','fiscal-positions','lock-dates','analytic-plans','withholding-tax','tax-return','cash-flow-forecast','grants','cost-allocation','depreciation-run','consolidation','gl-audit','finance-audit-trail','settings','pl-by-department','budget-utilization','kpi-ratios','donor-statement','bs-comparison','unrealized-gl','analytic-report','project-links'])
ON CONFLICT (hub_slug) DO UPDATE
SET parent_page_slug = EXCLUDED.parent_page_slug, tab_ids = EXCLUDED.tab_ids;

-- A tab grant without a parent grant is not reachable from navigation. Preserve
-- explicit parent blocks, but make existing active tab grants usable. Join
-- the registry before ranking and rank by parent (not tab), because sibling
-- grants share one parent conflict target. A permanent active tab grant wins;
-- otherwise the farthest expiry and latest row win deterministically.
WITH valid_tabs AS (
  SELECT tab.*, r.parent_page_slug,
    row_number() OVER (
      PARTITION BY tab.user_id, r.parent_page_slug
      ORDER BY (tab.expires_at IS NULL) DESC, tab.expires_at DESC NULLS LAST,
               tab.created_at DESC NULLS LAST, tab.id DESC
    ) AS rn
  FROM public.page_access_overrides tab
  JOIN public.access_tab_registry r
    ON split_part(tab.page_slug, ':', 1) = r.hub_slug
   AND split_part(tab.page_slug, ':', 2) = ANY(r.tab_ids)
  WHERE tab.page_slug ~ '^[^:]+:[^:]+$'
    AND tab.is_blocked IS FALSE
    AND (tab.expires_at IS NULL OR tab.expires_at > now())
), chosen_tabs AS (
  SELECT * FROM valid_tabs WHERE rn = 1
)
INSERT INTO public.page_access_overrides
  (user_id, page_slug, is_blocked, level, reason, expires_at,
   granted_by, approved_by, approved_at)
SELECT
  tab.user_id,
  tab.parent_page_slug,
  false,
  tab.level,
  'Parent page enabled by an existing tab grant.',
  tab.expires_at,
  tab.granted_by,
  tab.approved_by,
  tab.approved_at
FROM chosen_tabs tab
WHERE NOT EXISTS (
    SELECT 1
    FROM public.page_access_overrides parent
    WHERE parent.user_id = tab.user_id
      AND parent.page_slug = tab.parent_page_slug
      AND parent.is_blocked IS TRUE
      AND (parent.expires_at IS NULL OR parent.expires_at > now())
   )
ON CONFLICT (user_id, page_slug) DO UPDATE
SET is_blocked = false,
    level = EXCLUDED.level,
    reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at,
    granted_by = EXCLUDED.granted_by,
    approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at
WHERE public.page_access_overrides.expires_at IS NOT NULL
      AND public.page_access_overrides.expires_at <= now();

CREATE OR REPLACE FUNCTION public.toggle_user_tab_access(
  p_target_user_id uuid,
  p_tab_slug text,
  p_intent text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_parent text;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Not authorized to manage tab access.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND public.is_super_admin(id)
  ) THEN
    RAISE EXCEPTION 'Super Admin targets cannot receive access overrides.' USING ERRCODE = '42501';
  END IF;
  IF p_target_user_id IS NULL
     OR nullif(btrim(p_tab_slug), '') IS NULL
     OR btrim(p_tab_slug) !~ '^[^:]+:[^:]+$'
     OR p_intent NOT IN ('grant', 'block', 'clear') THEN
    RAISE EXCEPTION 'A valid hub tab and access intent are required.' USING ERRCODE = '22023';
  END IF;
  SELECT r.parent_page_slug INTO v_parent
  FROM public.access_tab_registry r
  WHERE split_part(btrim(p_tab_slug), ':', 1) = r.hub_slug
    AND split_part(btrim(p_tab_slug), ':', 2) = ANY(r.tab_ids);
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Unknown canonical hub tab: %', btrim(p_tab_slug)
      USING ERRCODE = '22023';
  END IF;

  IF p_intent = 'grant' AND EXISTS (
    SELECT 1 FROM public.page_access_overrides
    WHERE user_id = p_target_user_id
      AND page_slug = v_parent
      AND is_blocked IS TRUE
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RAISE EXCEPTION 'The parent hub page is explicitly blocked. Grant the parent page before granting this tab.'
      USING ERRCODE = '42501';
  END IF;

  IF p_intent = 'clear' THEN
    DELETE FROM public.page_access_overrides
    WHERE user_id = p_target_user_id AND page_slug = btrim(p_tab_slug);
  ELSIF p_intent = 'block' THEN
    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, btrim(p_tab_slug), true, 'view', NULL, NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = true,
          level = 'view',
          reason = NULL,
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;
  ELSE
    -- The parent insert and tab upsert are one transaction. Existing explicit
    -- parent grants retain their metadata; trigger attribution audits changes.
    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, v_parent, false, 'view',
            'Parent page enabled by tab grant.', NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = false,
          level = 'view',
          reason = 'Parent page enabled by tab grant.',
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;

    INSERT INTO public.page_access_overrides
      (user_id, page_slug, is_blocked, level, reason, expires_at,
       granted_by, approved_by, approved_at)
    VALUES (p_target_user_id, btrim(p_tab_slug), false, 'view', NULL, NULL,
            v_actor, v_actor, v_now)
    ON CONFLICT (user_id, page_slug) DO UPDATE
      SET is_blocked = false,
          level = 'view',
          reason = NULL,
          notes = NULL,
          expires_at = NULL,
          granted_by = v_actor,
          approved_by = v_actor,
          approved_at = v_now;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'tab_slug', btrim(p_tab_slug),
    'parent_slug', v_parent,
    'intent', p_intent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_user_tab_access(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_user_tab_access(uuid, text, text)
  TO authenticated;

-- Refresh the canonical access manifest after ensuring its role-tab dependency
-- exists. This keeps appointed Super Admins, multi-role tab blocking, user
-- overrides, action overrides, and role permissions in one snapshot.
CREATE OR REPLACE FUNCTION public.get_current_user_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH caller AS (SELECT auth.uid() AS user_id),
  assigned_roles AS (
    SELECT DISTINCT r.name::text AS role_name
    FROM public.canonical_user_role_assignments a
    JOIN caller c ON c.user_id = a.user_id
    JOIN public.roles r ON r.id = a.role_id AND r.is_active
    UNION
    SELECT 'superAdmin'::text FROM caller c
    WHERE c.user_id IS NOT NULL AND public.is_super_admin(c.user_id)
  ),
  tab_configs AS (
    SELECT coalesce(jsonb_object_agg(tab.page_slug, tab.is_blocked), '{}'::jsonb) AS value
    FROM (
      SELECT rtc.page_slug,
        count(DISTINCT rtc.role_id) FILTER (WHERE rtc.is_blocked) = (
          SELECT count(*) FROM public.canonical_user_role_assignments a
          JOIN caller c ON c.user_id = a.user_id
          JOIN public.roles r ON r.id = a.role_id AND r.is_active
        ) AS is_blocked
      FROM public.role_tab_configs rtc
      JOIN public.canonical_user_role_assignments a ON a.role_id = rtc.role_id
      JOIN caller c ON c.user_id = a.user_id
      JOIN public.roles r ON r.id = a.role_id AND r.is_active
      GROUP BY rtc.page_slug
    ) tab
  ),
  page_configs AS (
    SELECT coalesce(jsonb_object_agg(page_slug, to_jsonb(roles)), '{}'::jsonb) AS value
    FROM public.page_role_configs
  ),
  page_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      pao.page_slug, jsonb_build_object(
        'is_blocked', pao.is_blocked, 'notes', pao.notes,
        'reason', pao.reason, 'expires_at', pao.expires_at
      )), '{}'::jsonb) AS value
    FROM public.page_access_overrides pao
    JOIN caller c ON c.user_id = pao.user_id
    WHERE pao.expires_at IS NULL OR pao.expires_at > now()
  ),
  action_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      upo.resource || ':' || upo.action, jsonb_build_object(
        'is_granted', upo.is_granted, 'expires_at', upo.expires_at,
        'reason', upo.reason
      )), '{}'::jsonb) AS value
    FROM public.user_permission_overrides upo
    JOIN caller c ON c.user_id = upo.user_id
    WHERE upo.expires_at IS NULL OR upo.expires_at > now()
  ),
  role_permissions AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('resource', permission.resource, 'action', permission.action)
      ORDER BY permission.resource, permission.action
    ), '[]'::jsonb) AS value
    FROM public.get_user_permissions((SELECT user_id FROM caller)) permission
  )
  SELECT jsonb_build_object(
    'user_id', (SELECT user_id FROM caller),
    'roles', coalesce((SELECT jsonb_agg(role_name ORDER BY role_name) FROM assigned_roles), '[]'::jsonb),
    'page_role_configs', (SELECT value FROM page_configs),
    'role_tab_blocks', (SELECT value FROM tab_configs),
    'page_overrides', (SELECT value FROM page_overrides),
    'action_overrides', (SELECT value FROM action_overrides),
    'role_permissions', (SELECT value FROM role_permissions),
    'generated_at', now()
  );
$function$;

REVOKE ALL ON FUNCTION public.get_current_user_access_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_access_context() TO authenticated;
NOTIFY pgrst, 'reload schema';