-- Cancels only open Down Payment requests that belong to reclaimed MMP site
-- entries. This replaces the browser-side status update in the reclaim flow.

create or replace function public.cancel_reclaimed_site_down_payments(
  p_site_entry_ids uuid[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_cancelled_ids uuid[] := array[]::uuid[];
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Site reclaimed');
begin
  if v_actor_id is null then
    raise exception 'You must be signed in to cancel reclaimed-site down payments.';
  end if;

  if p_site_entry_ids is null or cardinality(p_site_entry_ids) = 0 then
    return jsonb_build_object('cancelled_ids', '[]'::jsonb, 'count', 0);
  end if;

  -- Reclaim is an operational MMP action, not a general finance cancellation.
  if not public.user_has_permission(v_actor_id, 'mmp', 'update')
     and not exists (
       select 1 from public.profiles p
       where p.id = v_actor_id
         and regexp_replace(lower(coalesce(p.role::text, '')), '[^a-z0-9]', '', 'g')
             in ('admin', 'fom')
     ) then
    raise exception 'You are not authorised to reclaim site entries.';
  end if;

  with cancellable as (
    select d.id
    from public.down_payment_requests d
    join public.mmp_site_entries s on s.id = d.mmp_site_entry_id
    where d.mmp_site_entry_id = any(p_site_entry_ids)
      and d.status in ('pending_supervisor', 'pending_admin')
      and s.forwarded_to_user_id is null
    for update of d
  ), updated as (
    update public.down_payment_requests d
    set status = 'cancelled',
        updated_at = now(),
        metadata = case when jsonb_typeof(d.metadata) = 'object' then d.metadata else '{}'::jsonb end
          || jsonb_build_object(
            'auto_cancelled_reason', 'Auto-cancelled after site reclaim: ' || v_reason,
            'reclaimed_by', v_actor_id,
            'reclaimed_at', now()
          )
    from cancellable c
    where d.id = c.id
    returning d.id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_cancelled_ids from updated;

  return jsonb_build_object(
    'cancelled_ids', to_jsonb(v_cancelled_ids),
    'count', cardinality(v_cancelled_ids)
  );
end;
$$;

revoke all on function public.cancel_reclaimed_site_down_payments(uuid[], text) from public, anon;
grant execute on function public.cancel_reclaimed_site_down_payments(uuid[], text) to authenticated;
