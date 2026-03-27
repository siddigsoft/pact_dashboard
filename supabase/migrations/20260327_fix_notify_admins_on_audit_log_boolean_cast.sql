-- Fix admin notification trigger boolean-cast error
-- Root cause: invalid CASE branch attempted to evaluate text literal as boolean.
create or replace function public.notify_admins_on_audit_log()
returns trigger
language plpgsql
as $$
declare
  admin_user record;
  notification_title text;
  notification_message text;
  action_url text;
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
begin
  if new.actor_role = 'system' and new.actor_id = 'system' and new.severity in ('info') then
    return new;
  end if;

  notification_title := coalesce(new.description, new.action || ' in ' || new.module);
  notification_message := coalesce(new.description, '') || coalesce(
    case when new.entity_name is not null then ' - ' || new.entity_name else '' end,
    ''
  );

  action_url := case
    when new.entity_type = 'mmp_file' or new.entity_type like 'mmp%' then '/mmp/' || new.entity_id
    when new.entity_type = 'site_visit' or new.entity_type like 'site%' then '/mmp?site=' || new.entity_id
    when new.entity_type = 'transaction' then '/wallet'
    when new.entity_type = 'user' then '/users'
    when new.entity_type = 'project' then '/projects/' || new.entity_id
    when new.entity_type = 'wallet' then '/wallet'
    else null
  end;

  for admin_user in
    select distinct p.id, p.email, p.full_name
    from profiles p
    where (
      p.role in ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
      or exists (
        select 1 from user_roles ur
        where ur.user_id = p.id
          and (
            ur.role in ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
            or exists (
              select 1
              from roles r
              where r.id = ur.role_id
                and lower(r.name) in ('admin', 'superadmin', 'super_admin')
            )
          )
      )
    )
      and (p.status is null or p.status != 'deleted')
  loop
    begin
      insert into notifications (
        recipient_id, user_id, title_en, title_ar, message_en, message_ar, title, message,
        event_type, entity_type, entity_id, related_entity_type, related_entity_id,
        action_url, link, priority, status, triggered_by, triggered_by_name, workflow_stage,
        type, metadata, created_at
      )
      values (
        admin_user.id, admin_user.id,
        notification_title, notification_title,
        notification_message, notification_message,
        notification_title, notification_message,
        new.module || '_' || lower(new.action),
        new.entity_type, new.entity_id,
        new.entity_type, new.entity_id,
        action_url, action_url,
        case new.severity
          when 'error' then 'high'
          when 'warning' then 'high'
          when 'critical' then 'urgent'
          else 'normal'
        end,
        'pending',
        case
          when new.actor_id != 'system'
            and new.actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then new.actor_id::uuid
          else null
        end,
        coalesce(new.actor_name, 'System'),
        new.workflow_step,
        case
          when new.severity in ('error', 'critical') then 'error'
          when new.severity = 'warning' then 'warning'
          else 'info'
        end,
        jsonb_build_object(
          'audit_log_id', new.id,
          'timestamp', new.timestamp,
          'module', new.module,
          'action', new.action,
          'severity', new.severity,
          'actor_id', new.actor_id,
          'actor_name', new.actor_name,
          'entity_name', new.entity_name
        ),
        now()
      );
    exception when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_message  = message_text,
        v_detail   = pg_exception_detail,
        v_hint     = pg_exception_hint,
        v_context  = pg_exception_context;
      raise warning
        'Failed to create notification for admin %: [%] %, detail=%, hint=%, context=%',
        admin_user.id, v_sqlstate, v_message, coalesce(v_detail, '-'), coalesce(v_hint, '-'), coalesce(v_context, '-');
    end;
  end loop;

  return new;
end;
$$;
