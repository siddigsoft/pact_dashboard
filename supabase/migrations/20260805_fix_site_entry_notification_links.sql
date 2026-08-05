-- Fix site-entry notification deep links.
-- Bug: notify_admins_on_audit_log used '/mmp/' || entity_id for all entity_type LIKE 'mmp%',
-- so mmp_site_entry notifications linked to the site-entry UUID (404 on MMP detail).
-- Correct link: /mmp/{mmp_file_id}?site={site_entry_id}

CREATE OR REPLACE FUNCTION public.notify_admins_on_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user RECORD;
  notification_title TEXT;
  notification_message TEXT;
  action_url TEXT;
  v_mmp_file_id UUID;
  v_sqlstate TEXT;
  v_message TEXT;
  v_detail TEXT;
  v_hint TEXT;
  v_context TEXT;
BEGIN
  IF NEW.actor_role = 'system' AND NEW.actor_id = 'system' AND NEW.severity IN ('info') THEN
    RETURN NEW;
  END IF;

  notification_title := COALESCE(NEW.description, NEW.action || ' in ' || NEW.module);
  notification_message := COALESCE(NEW.description, '') || COALESCE(
    CASE WHEN NEW.entity_name IS NOT NULL THEN ' - ' || NEW.entity_name ELSE '' END,
    ''
  );

  IF NEW.entity_type IN ('mmp_site_entry', 'mmpSiteEntry', 'mmp_site') THEN
    SELECT mse.mmp_file_id INTO v_mmp_file_id
    FROM mmp_site_entries mse
    WHERE mse.id = NEW.entity_id
    LIMIT 1;

    IF v_mmp_file_id IS NOT NULL THEN
      action_url := '/mmp/' || v_mmp_file_id::text || '?site=' || NEW.entity_id::text;
    ELSE
      action_url := '/mmp?site=' || NEW.entity_id::text;
    END IF;
  ELSIF NEW.entity_type = 'mmp_file' OR NEW.entity_type LIKE 'mmp%' THEN
    action_url := '/mmp/' || NEW.entity_id;
  ELSIF NEW.entity_type = 'site_visit' OR NEW.entity_type LIKE 'site%' THEN
    action_url := '/mmp?site=' || NEW.entity_id;
  ELSIF NEW.entity_type = 'transaction' THEN
    action_url := '/wallet';
  ELSIF NEW.entity_type = 'user' THEN
    action_url := '/users';
  ELSIF NEW.entity_type = 'project' THEN
    action_url := '/projects/' || NEW.entity_id;
  ELSIF NEW.entity_type = 'wallet' THEN
    action_url := '/wallet';
  ELSE
    action_url := NULL;
  END IF;

  FOR admin_user IN
    SELECT DISTINCT p.id, p.email, p.full_name
    FROM profiles p
    WHERE (
      p.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.id
          AND (
            ur.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
            OR EXISTS (
              SELECT 1
              FROM roles r
              WHERE r.id = ur.role_id
                AND lower(r.name) IN ('admin', 'superadmin', 'super_admin')
            )
          )
      )
    )
      AND (p.status IS NULL OR p.status != 'deleted')
  LOOP
    BEGIN
      INSERT INTO notifications (
        recipient_id, user_id, title_en, title_ar, message_en, message_ar, title, message,
        event_type, entity_type, entity_id, related_entity_type, related_entity_id,
        action_url, link, priority, status, triggered_by, triggered_by_name, workflow_stage,
        type, metadata, created_at
      )
      VALUES (
        admin_user.id, admin_user.id,
        notification_title, notification_title,
        notification_message, notification_message,
        notification_title, notification_message,
        NEW.module || '_' || lower(NEW.action),
        NEW.entity_type, NEW.entity_id,
        NEW.entity_type, NEW.entity_id,
        action_url, action_url,
        CASE NEW.severity
          WHEN 'error' THEN 'high'
          WHEN 'warning' THEN 'high'
          WHEN 'critical' THEN 'urgent'
          ELSE 'normal'
        END,
        'pending',
        CASE
          WHEN NEW.actor_id != 'system'
            AND NEW.actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN NEW.actor_id::uuid
          ELSE NULL
        END,
        COALESCE(NEW.actor_name, 'System'),
        NEW.workflow_step,
        CASE
          WHEN NEW.severity IN ('error', 'critical') THEN 'error'
          WHEN NEW.severity = 'warning' THEN 'warning'
          ELSE 'info'
        END,
        jsonb_build_object(
          'audit_log_id', NEW.id,
          'timestamp', NEW.timestamp,
          'module', NEW.module,
          'action', NEW.action,
          'severity', NEW.severity,
          'actor_id', NEW.actor_id,
          'actor_name', NEW.actor_name,
          'entity_name', NEW.entity_name
        ),
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_sqlstate = RETURNED_SQLSTATE,
        v_message  = MESSAGE_TEXT,
        v_detail   = PG_EXCEPTION_DETAIL,
        v_hint     = PG_EXCEPTION_HINT,
        v_context  = PG_EXCEPTION_CONTEXT;
      RAISE WARNING
        'Failed to create notification for admin %: [%] %, detail=%, hint=%, context=%',
        admin_user.id, v_sqlstate, v_message, COALESCE(v_detail, '-'), COALESCE(v_hint, '-'), COALESCE(v_context, '-');
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Repair existing broken site-entry notification links
UPDATE notifications n
SET
  link = '/mmp/' || mse.mmp_file_id::text || '?site=' || mse.id::text,
  action_url = '/mmp/' || mse.mmp_file_id::text || '?site=' || mse.id::text
FROM mmp_site_entries mse
WHERE mse.id = n.related_entity_id
  AND n.related_entity_type IN ('mmp_site_entry', 'mmpSiteEntry', 'mmp_site')
  AND n.link = '/mmp/' || mse.id::text;
