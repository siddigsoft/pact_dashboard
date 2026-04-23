-- Multi-tier leave approval: Manager → HR.
-- Adds a per-request approver chain plus an immutable history of decisions.
-- Existing single-step admin approvals continue to work; new requests are
-- routed through the chain when the requester has a manager and the leave
-- type requires HR sign-off.

alter table public.leave_requests
  add column if not exists approver_chain jsonb not null default '[]'::jsonb,
  add column if not exists current_approver_id uuid,
  add column if not exists current_tier text,           -- 'manager' | 'hr' | null
  add column if not exists approval_history jsonb not null default '[]'::jsonb;

comment on column public.leave_requests.approver_chain is
  'Ordered list of approvers: [{tier:"manager"|"hr", user_id:uuid, decided_at?, decision?, comment?}]';
comment on column public.leave_requests.current_approver_id is
  'Whoever needs to act next. NULL once the chain is fully approved/rejected.';
comment on column public.leave_requests.current_tier is
  'Tier label of the current approver, used for UI/notification copy.';
comment on column public.leave_requests.approval_history is
  'Append-only log of decisions: [{tier, user_id, decision, comment, at}]';

create index if not exists idx_leave_requests_current_approver
  on public.leave_requests (current_approver_id)
  where current_approver_id is not null;

-- Helper RPC: build the chain for a given request based on the requester's
-- manager (profiles.reports_to) plus an HR pool. Idempotent — can be called
-- when a request is created or when the requester changes managers.
create or replace function public.build_leave_approver_chain(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req      record;
  v_mgr      uuid;
  v_chain    jsonb := '[]'::jsonb;
  v_first    record;
begin
  select id, user_id, status, current_approver_id
    into v_req
    from leave_requests
   where id = p_request_id;
  if not found then raise exception 'leave request % not found', p_request_id; end if;

  -- Manager step (if any)
  select reports_to into v_mgr from profiles where id = v_req.user_id;
  if v_mgr is not null then
    v_chain := v_chain || jsonb_build_array(jsonb_build_object('tier', 'manager', 'user_id', v_mgr));
  end if;

  -- HR step: route to the first HR/admin user (deterministic).
  select id into v_first
    from (
      select id from profiles
       where lower(coalesce(role, '')) in ('hr','admin','super_admin','superadmin')
       order by full_name nulls last, id
       limit 1
    ) s;
  if v_first.id is not null then
    v_chain := v_chain || jsonb_build_array(jsonb_build_object('tier', 'hr', 'user_id', v_first.id));
  end if;

  -- Set the current approver to the first unresolved entry in the chain.
  update leave_requests
     set approver_chain      = v_chain,
         current_approver_id = (v_chain->0->>'user_id')::uuid,
         current_tier        = v_chain->0->>'tier',
         updated_at          = now()
   where id = p_request_id;

  return v_chain;
end;
$$;

grant execute on function public.build_leave_approver_chain(uuid) to authenticated;

-- Decide the current step. Caller must be the current_approver_id or admin.
-- p_decision: 'approved' | 'rejected'
create or replace function public.decide_leave_request(
  p_request_id uuid,
  p_decision   text,
  p_comment    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req       leave_requests%rowtype;
  v_caller    uuid := auth.uid();
  v_is_admin  boolean;
  v_chain     jsonb;
  v_idx       int;
  v_next_idx  int;
  v_history   jsonb;
  v_now       timestamptz := now();
  v_next_app  uuid;
  v_next_tier text;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_req from leave_requests where id = p_request_id for update;
  if not found then raise exception 'leave request % not found', p_request_id; end if;

  v_is_admin := exists (
    select 1 from profiles
    where id = v_caller
      and lower(coalesce(role, '')) in ('admin','superadmin','super_admin','hr')
  );

  if not (v_caller = v_req.current_approver_id or v_is_admin) then
    raise exception 'not authorized to decide this leave request';
  end if;

  v_chain := coalesce(v_req.approver_chain, '[]'::jsonb);
  -- Find the index of the current approver in the chain.
  v_idx := -1;
  for i in 0 .. jsonb_array_length(v_chain) - 1 loop
    if (v_chain->i->>'user_id')::uuid = v_req.current_approver_id then
      v_idx := i;
      exit;
    end if;
  end loop;

  -- Stamp the decision into the chain entry and append to history.
  if v_idx >= 0 then
    v_chain := jsonb_set(v_chain, array[v_idx::text],
      (v_chain->v_idx) || jsonb_build_object(
        'decided_at', to_jsonb(v_now),
        'decision',   to_jsonb(p_decision),
        'comment',    to_jsonb(p_comment),
        'decided_by', to_jsonb(v_caller)
      ));
  end if;
  v_history := coalesce(v_req.approval_history, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
        'tier',       v_req.current_tier,
        'user_id',    v_caller,
        'decision',   p_decision,
        'comment',    p_comment,
        'at',         v_now));

  if p_decision = 'rejected' then
    update leave_requests
       set status              = 'rejected',
           approver_chain      = v_chain,
           approval_history    = v_history,
           current_approver_id = null,
           current_tier        = null,
           updated_at          = v_now
     where id = p_request_id;
    return jsonb_build_object('status','rejected');
  end if;

  -- Approved at this tier — advance to next tier or finalize.
  v_next_idx := v_idx + 1;
  if v_next_idx < jsonb_array_length(v_chain) then
    v_next_app  := (v_chain->v_next_idx->>'user_id')::uuid;
    v_next_tier := v_chain->v_next_idx->>'tier';
    update leave_requests
       set status              = 'pending',
           approver_chain      = v_chain,
           approval_history    = v_history,
           current_approver_id = v_next_app,
           current_tier        = v_next_tier,
           updated_at          = v_now
     where id = p_request_id;
    return jsonb_build_object('status','pending','next_tier',v_next_tier,'next_approver',v_next_app);
  else
    update leave_requests
       set status              = 'approved',
           approver_chain      = v_chain,
           approval_history    = v_history,
           current_approver_id = null,
           current_tier        = null,
           updated_at          = v_now
     where id = p_request_id;
    return jsonb_build_object('status','approved');
  end if;
end;
$$;

grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;
