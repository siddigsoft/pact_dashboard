-- Cost submission approvals are enforced by approval-level permissions
-- (approve_hub / approve_field_ops / approve_country / approve_final) instead of role names.

create or replace function public.cost_submission_approval_chain(p_submitter_role text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  r text := lower(regexp_replace(coalesce(p_submitter_role, ''), '[\s_-]', '', 'g'));
begin
  if r = 'countrydirector' then
    return array['final'];
  elsif r = 'fom' or r like '%fieldoperationmanager%' then
    return array['country', 'final'];
  elsif r ~ '(coordinator|enumerator|datacollector|fieldstaff|fieldworker|fieldagent|fieldofficer)' then
    return array['hub', 'field_ops', 'country', 'final'];
  elsif lower(coalesce(p_submitter_role, '')) like '%supervisor%' then
    return array['field_ops', 'country', 'final'];
  end if;
  return array['final', 'final'];
end;
$$;

create or replace function public.current_user_can_approve_cost_level(p_submission_id uuid, p_level text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hub text;
  v_submitter_state text;
  v_me public.profiles%rowtype;
  v_hub_has_supervisor boolean;
begin
  if p_level = 'final' then
    return public.current_user_has_resource_permission('cost_submissions', 'approve_final');
  elsif p_level = 'country' then
    return public.current_user_has_resource_permission('cost_submissions', 'approve_country');
  elsif p_level = 'field_ops' then
    return public.current_user_has_resource_permission('cost_submissions', 'approve_field_ops');
  elsif p_level <> 'hub' then
    return false;
  end if;

  select public.canonical_operational_cost_hub_id(coalesce(s.hub_id, sub.hub_id, sub.state_id, sub.location->>'state_id')),
         sub.state_id
    into v_hub, v_submitter_state
  from public.operational_cost_submissions s
  left join public.profiles sub on sub.id = s.submitted_by
  where s.id = p_submission_id;

  select exists (
    select 1 from public.profiles sp
    where coalesce(sp.status, 'approved') = 'approved'
      and (
        (lower(regexp_replace(coalesce(sp.role, ''), '[\s_-]', '', 'g')) in ('supervisor', 'hubsupervisor')
          and public.canonical_operational_cost_hub_id(sp.hub_id) = v_hub)
        or exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(sp.additional_roles) = 'array' then sp.additional_roles else '[]'::jsonb end) ar
          where lower(regexp_replace(coalesce(ar->>'role', ''), '[\s_-]', '', 'g')) in ('supervisor', 'hubsupervisor')
            and public.canonical_operational_cost_hub_id(ar->>'hub_id') = v_hub
        )
      )
  ) into v_hub_has_supervisor;

  -- Field-ops approvers cover hub level for hubs that have no supervisor.
  if public.current_user_has_resource_permission('cost_submissions', 'approve_field_ops')
     and not coalesce(v_hub_has_supervisor, false) then
    return true;
  end if;

  if not public.current_user_has_resource_permission('cost_submissions', 'approve_hub') then
    return false;
  end if;

  -- Final approvers are org-wide; other hub approvers are limited to their own hubs.
  if public.current_user_has_resource_permission('cost_submissions', 'approve_final') then
    return true;
  end if;

  select * into v_me from public.profiles where id = auth.uid();
  if v_hub is null then
    return v_submitter_state is not null and v_submitter_state = v_me.state_id;
  end if;
  return public.canonical_operational_cost_hub_id(v_me.hub_id) = v_hub
      or public.canonical_operational_cost_hub_id(coalesce(v_me.secondary_hub_id, v_me.location->>'secondary_hub_id')) = v_hub;
end;
$$;

create or replace function public.assert_cost_submission_approval(p_old jsonb, p_new jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chain text[] := public.cost_submission_approval_chain(p_old->>'submitter_role');
  v_old_status text;
  v_new_status text;
  v_decided boolean := false;
  i int;
begin
  if (p_old->>'submitted_by')::uuid = auth.uid() then
    raise exception 'You cannot approve or reject your own cost submission'
      using errcode = '42501';
  end if;

  for i in 1..4 loop
    v_old_status := p_old->>('tier' || i || '_status');
    v_new_status := p_new->>('tier' || i || '_status');
    continue when v_old_status is not distinct from v_new_status;

    if coalesce(v_old_status, 'pending') = 'pending'
       and v_new_status in ('approved', 'rejected')
       and i <= coalesce(array_length(v_chain, 1), 0) then
      if i > 1 and (p_new->>('tier' || (i - 1) || '_status')) is distinct from 'approved' then
        raise exception 'Tier % cannot be decided before tier % is approved', i, i - 1
          using errcode = '42501';
      end if;
      if not public.current_user_can_approve_cost_level((p_old->>'id')::uuid, v_chain[i]) then
        raise exception 'Access denied: tier % needs the cost_submissions:approve_% permission', i, v_chain[i]
          using errcode = '42501';
      end if;
      v_decided := true;
    else
      perform public.assert_resource_permission('cost_submissions', 'approve');
    end if;
  end loop;

  if not v_decided then
    perform public.assert_resource_permission('cost_submissions', 'approve');
  end if;
end;
$$;

revoke execute on function public.current_user_can_approve_cost_level(uuid, text) from public, anon;
revoke execute on function public.assert_cost_submission_approval(jsonb, jsonb) from public, anon;
grant execute on function public.current_user_can_approve_cost_level(uuid, text) to authenticated, service_role;
grant execute on function public.assert_cost_submission_approval(jsonb, jsonb) to authenticated, service_role;

create or replace function public.guard_finance_resource_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  before_row jsonb := to_jsonb(OLD);
  after_row jsonb := to_jsonb(NEW);
  resource text;
  approval_changed boolean;
  payment_changed boolean;
  v_is_kassala_request boolean;
  v_unapproved_changes boolean;
begin
  if auth.role() = 'service_role' or auth.uid() is null then return NEW; end if;
  if TG_TABLE_NAME = 'operational_cost_submissions'
     and current_setting('app.pre_fund_payment_rpc', true) = 'on' then
    return NEW;
  end if;

  resource := case when TG_TABLE_NAME = 'down_payment_requests' then 'down_payments' else 'cost_submissions' end;
  approval_changed := (before_row->>'status' is distinct from after_row->>'status'
      and after_row->>'status' in ('approved','rejected','under_review','pending_admin'))
    or before_row->>'tier1_status' is distinct from after_row->>'tier1_status'
    or before_row->>'tier2_status' is distinct from after_row->>'tier2_status'
    or before_row->>'tier3_status' is distinct from after_row->>'tier3_status'
    or before_row->>'tier4_status' is distinct from after_row->>'tier4_status'
    or before_row->>'supervisor_approved_by' is distinct from after_row->>'supervisor_approved_by'
    or before_row->>'admin_processed_by' is distinct from after_row->>'admin_processed_by';
  payment_changed := before_row->>'total_paid_amount' is distinct from after_row->>'total_paid_amount'
    or before_row->>'amount_paid_cents' is distinct from after_row->>'amount_paid_cents'
    or before_row->>'paid_amount_cents' is distinct from after_row->>'paid_amount_cents'
    or before_row->>'wallet_transaction_id' is distinct from after_row->>'wallet_transaction_id'
    or before_row->>'wallet_transaction_ids' is distinct from after_row->>'wallet_transaction_ids'
    or (before_row->>'status' is distinct from after_row->>'status'
        and after_row->>'status' in ('paid','partially_paid','fully_paid'));

  if public.is_kassala_hub_supervisor(auth.uid()) then
    if TG_TABLE_NAME = 'down_payment_requests' then
      if current_setting('app.down_payment_payment_authorized', true) = 'on' then
        return NEW;
      end if;

      if approval_changed then
        select exists (
          select 1 from public.hubs h
          where h.id::text = OLD.hub_id::text
            and regexp_replace(lower(coalesce(h.name, OLD.hub_name, '')), '[^a-z]', '', 'g')
                in ('kassala', 'kassalahub')
        ) into v_is_kassala_request;

        if not coalesce(v_is_kassala_request, false) then
          raise exception 'Access denied: Tier 1 approval is limited to Kassala Hub requests.'
            using errcode = '42501';
        end if;
        if OLD.status is distinct from 'pending_supervisor'
           or NEW.status not in ('pending_admin', 'rejected')
           or NEW.supervisor_approved_by is distinct from auth.uid()
           or (NEW.status = 'pending_admin'
               and (NEW.supervisor_status is distinct from 'approved'
                    or NEW.admin_status is distinct from 'pending'))
           or (NEW.status = 'rejected' and NEW.supervisor_status is distinct from 'rejected') then
          raise exception 'Access denied: Kassala supervisors may perform Tier 1 approval or rejection only.'
            using errcode = '42501';
        end if;

        v_unapproved_changes :=
          (before_row - array[
            'supervisor_status','supervisor_approved_by','supervisor_approved_at',
            'supervisor_notes','supervisor_rejection_reason','remaining_amount',
            'status','admin_status','updated_at','metadata'
          ]::text[])
          is distinct from
          (after_row - array[
            'supervisor_status','supervisor_approved_by','supervisor_approved_at',
            'supervisor_notes','supervisor_rejection_reason','remaining_amount',
            'status','admin_status','updated_at','metadata'
          ]::text[]);
        if v_unapproved_changes then
          raise exception 'Access denied: Tier 1 approval attempted to change restricted fields.'
            using errcode = '42501';
        end if;
        return NEW;
      end if;
    elsif TG_TABLE_NAME = 'operational_cost_submissions' and approval_changed then
      select exists (
        select 1
        from public.hubs h
        where regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
                in ('kassala', 'kassalahub')
          and (
            public.canonical_operational_cost_hub_id(OLD.hub_id::text)
              = public.canonical_operational_cost_hub_id(h.id::text)
            or exists (
              select 1 from public.profiles submitter
              where submitter.id = OLD.submitted_by
                and (
                  public.canonical_operational_cost_hub_id(submitter.hub_id::text)
                    = public.canonical_operational_cost_hub_id(h.id::text)
                  or public.canonical_operational_cost_hub_id(submitter.secondary_hub_id::text)
                    = public.canonical_operational_cost_hub_id(h.id::text)
                )
            )
          )
      ) into v_is_kassala_request;

      if not coalesce(v_is_kassala_request, false) then
        raise exception 'Access denied: Cost Submission Tier 1 approval is limited to Kassala Hub.'
          using errcode = '42501';
      end if;
      if OLD.tier1_status is distinct from 'pending'
         or NEW.tier1_status not in ('approved', 'rejected')
         or NEW.tier1_approved_by is distinct from auth.uid()
         or NEW.status not in ('under_review', 'rejected')
         or NEW.tier2_status is distinct from OLD.tier2_status
         or NEW.tier3_status is distinct from OLD.tier3_status
         or NEW.tier4_status is distinct from OLD.tier4_status
         or NEW.tier2_approved_by is distinct from OLD.tier2_approved_by
         or NEW.tier3_approved_by is distinct from OLD.tier3_approved_by
         or NEW.tier4_approved_by is distinct from OLD.tier4_approved_by then
        raise exception 'Access denied: Kassala supervisors may perform Cost Submission Tier 1 only.'
          using errcode = '42501';
      end if;

      v_unapproved_changes :=
        (before_row - array[
          'tier1_status','tier1_approved_by','tier1_approved_at','tier1_notes',
          'status','rejection_reason','updated_at','supporting_documents'
        ]::text[])
        is distinct from
        (after_row - array[
          'tier1_status','tier1_approved_by','tier1_approved_at','tier1_notes',
          'status','rejection_reason','updated_at','supporting_documents'
        ]::text[]);
      if v_unapproved_changes then
        raise exception 'Access denied: Cost Submission Tier 1 attempted to change restricted fields.'
          using errcode = '42501';
      end if;
      return NEW;
    end if;
  end if;

  if payment_changed then
    perform public.assert_resource_permission(resource, 'approve');
    perform public.assert_resource_permission('pre_funding', 'update');
    if TG_TABLE_NAME = 'down_payment_requests' then
      perform public.assert_resource_permission('wallets', 'update');
    end if;
  elsif approval_changed then
    if TG_TABLE_NAME = 'operational_cost_submissions' then
      perform public.assert_cost_submission_approval(before_row, after_row);
    else
      perform public.assert_resource_permission(resource, 'approve');
    end if;
  else
    perform public.assert_resource_permission(resource, 'update');
  end if;
  return NEW;
end;
$function$;

-- Row access: who may write at all. Field-level and tier rules live in the trigger above.
drop policy if exists "Authorized roles can create operational cost submissions" on public.operational_cost_submissions;
create policy ocs_insert_with_submit_permission on public.operational_cost_submissions
  for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and (select public.current_user_has_resource_permission('cost_submissions', 'submit'))
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and coalesce(p.status, 'approved') = 'approved'
    )
  );

drop policy if exists "FOM can bypass approve operational cost submissions" on public.operational_cost_submissions;
drop policy if exists "Supervisors can update tier1 for hub submissions" on public.operational_cost_submissions;
drop policy if exists ocs_update_merged on public.operational_cost_submissions;
create policy ocs_update_with_permissions on public.operational_cost_submissions
  for update to authenticated
  using (
    submitted_by = (select auth.uid())
    or (select public.current_user_has_resource_permission('cost_submissions', 'update'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'approve'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'mark_paid'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'approve_hub'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'approve_field_ops'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'approve_country'))
    or (select public.current_user_has_resource_permission('cost_submissions', 'approve_final'))
  )
  with check (true);

drop policy if exists operational_cost_submissions_delete_combined on public.operational_cost_submissions;
create policy ocs_delete_with_permission on public.operational_cost_submissions
  for delete to authenticated
  using (
    (select public.current_user_has_resource_permission('cost_submissions', 'delete'))
    or (submitted_by = (select auth.uid()) and status = 'pending' and tier1_status = 'pending')
  );
