-- Add explicit-deny ceilings without broadening established row/hub/workflow
-- policies. These are deliberately RESTRICTIVE: an older permissive policy
-- cannot restore a blocked capability. They are not a substitute for each
-- resource's ownership policies or SECURITY DEFINER RPC authorization.
create or replace function public.resource_override_allows(p_resource text, p_action text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  decision boolean;
begin
  if auth.role() = 'service_role' then return true; end if;
  if caller is null then return false; end if;
  if public.is_super_admin(caller) then return true; end if;
  select o.is_granted into decision from public.user_permission_overrides o
  where o.user_id = caller and o.resource = p_resource and o.action = p_action
    and (o.expires_at is null or o.expires_at > now());
  return case when found then decision else true end;
end;
$$;
revoke all on function public.resource_override_allows(text,text) from public, anon;
grant execute on function public.resource_override_allows(text,text) to authenticated, service_role;

do $$
declare
  mapping record;
begin
  for mapping in select * from (values
    ('projects','projects'), ('project_activities','projects'), ('sub_activities','projects'),
    ('mmp_files','mmp'), ('mmp_site_entries','mmp'), ('site_visits','site_visits'),
    ('site_visit_cost_submissions','cost_submissions'),
    ('operational_cost_submissions','cost_submissions'),
    ('down_payment_requests','down_payments'),
    ('pre_fund_requests','pre_funding'), ('pre_fund_transactions','pre_funding'),
    ('pre_fund_allocations','pre_funding'), ('pre_fund_approval_steps','pre_funding'),
    ('pre_fund_reconciliations','pre_funding'),
    ('wallets','wallets'), ('wallet_transactions','wallets'),
    ('acct_journal_entries','accounting'), ('acct_journal_lines','accounting'),
    ('acct_accounts','accounting'), ('acct_funds','accounting'),
    ('procurement_requests','procurement'), ('purchase_orders','procurement'),
    ('fixed_assets','fixed_assets'), ('hr_employees','hr'),
    ('payroll_runs','payroll'), ('payroll_items','payroll'),
    ('leave_requests','leave'), ('incidents','incidents'), ('surveys','surveys')
  ) as resources(table_name, resource)
  loop
    if to_regclass('public.' || mapping.table_name) is null then
      raise notice 'Override ceiling skipped absent table: %', mapping.table_name;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', mapping.table_name);
    execute format('drop policy if exists access_override_read_ceiling on public.%I', mapping.table_name);
    execute format('create policy access_override_read_ceiling on public.%I as restrictive for select to authenticated using (public.resource_override_allows(%L, %L))', mapping.table_name, mapping.resource, 'read');
    execute format('drop policy if exists access_override_create_ceiling on public.%I', mapping.table_name);
    execute format('create policy access_override_create_ceiling on public.%I as restrictive for insert to authenticated with check (public.resource_override_allows(%L, %L))', mapping.table_name, mapping.resource, 'create');
    execute format('drop policy if exists access_override_update_ceiling on public.%I', mapping.table_name);
    execute format('create policy access_override_update_ceiling on public.%I as restrictive for update to authenticated using (public.resource_override_allows(%L, %L)) with check (public.resource_override_allows(%L, %L))', mapping.table_name, mapping.resource, 'update', mapping.resource, 'update');
    execute format('drop policy if exists access_override_delete_ceiling on public.%I', mapping.table_name);
    execute format('create policy access_override_delete_ceiling on public.%I as restrictive for delete to authenticated using (public.resource_override_allows(%L, %L))', mapping.table_name, mapping.resource, 'delete');
  end loop;
end;
$$;
