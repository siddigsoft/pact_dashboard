-- Incentives becomes a grantable permission resource; the deleted Safety Hub,
-- Incident Reports, and Equipment screens lose their role grants.

DELETE FROM public.permissions WHERE resource IN ('safety', 'incidents', 'equipment');

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_resource_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_resource_check CHECK (resource::text = ANY (ARRAY[
  'users','roles','permissions','settings','system','super_admins','audit_logs',
  'projects','portfolio','analytics','mmp','site_visits','hub_operations','coverage_map',
  'safety','incidents','equipment',
  'finances','cost_submissions','wallets','down_payments','pre_funding','accounting','fixed_assets','procurement','transactions',
  'signatures','reports','crm','surveys','tasks','notifications','calendar',
  'hr','hr_analytics','payroll','benefits','leave','pulse_surveys','succession',
  'integrations','broadcast','whatsapp','incentives'
]::text[]));

CREATE OR REPLACE FUNCTION public.incentive_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superAdmin', 'admin')
  ) OR public.current_user_has_resource_permission('incentives', 'update');
$function$;

CREATE OR REPLACE FUNCTION public.incentive_is_finance_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superAdmin', 'admin', 'financialAdmin')
  ) OR public.current_user_has_resource_permission('incentives', 'read')
    OR public.current_user_has_resource_permission('incentives', 'update');
$function$;
