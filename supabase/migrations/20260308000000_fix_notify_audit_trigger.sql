-- Fix notify_admins_on_audit_log: CASE was comparing entity_type (text) to a
-- boolean, causing "invalid input syntax for type boolean" when inserting
-- audit_logs with entity_type = 'mmp_site_entry'. Use searched CASE instead.

CREATE OR REPLACE FUNCTION public.notify_admins_on_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_user RECORD;
  notification_title TEXT;
  notification_message TEXT;
  action_url TEXT;
BEGIN
  IF NEW.actor_role = 'system' AND NEW.actor_id = 'system' AND NEW.severity IN ('info') THEN
    RETURN NEW;
  END IF;

  notification_title := COALESCE(NEW.description, NEW.action || ' in ' || NEW.module);
  notification_message := COALESCE(NEW.description, '') || COALESCE(
    CASE WHEN NEW.entity_name IS NOT NULL THEN ' - ' || NEW.entity_name ELSE '' END,
    ''
  );

  -- Use searched CASE so we can test entity_type with LIKE and multiple conditions
  action_url := CASE
    WHEN NEW.entity_type = 'mmp_file' OR NEW.entity_type LIKE 'mmp%' THEN '/mmp/' || NEW.entity_id
    WHEN NEW.entity_type = 'site_visit' OR NEW.entity_type LIKE 'site%' THEN '/mmp?site=' || NEW.entity_id
    WHEN NEW.entity_type = 'transaction' THEN '/wallet'
    WHEN NEW.entity_type = 'user' THEN '/users'
    WHEN NEW.entity_type = 'project' THEN '/projects/' || NEW.entity_id
    WHEN NEW.entity_type = 'wallet' THEN '/wallet'
    ELSE NULL
  END;

  FOR admin_user IN
    SELECT DISTINCT p.id, p.email, p.full_name
    FROM profiles p
    WHERE (
      p.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.id
        AND (ur.role IN ('admin', 'Admin', 'superAdmin', 'super_admin', 'SuperAdmin')
          OR EXISTS (SELECT 1 FROM roles r WHERE r.id = ur.role_id AND LOWER(r.name) IN ('admin', 'superadmin', 'super_admin')))
      )
    )
    AND (p.status IS NULL OR p.status != 'deleted')
  LOOP
    BEGIN
      INSERT INTO notifications (
        recipient_id, user_id, title_en, title_ar, message_en, message_ar,
        title, message, event_type, entity_type, entity_id,
        related_entity_type, related_entity_id, action_url, link, priority, status,
        triggered_by, triggered_by_name, workflow_stage, type, metadata, created_at
      ) VALUES (
        admin_user.id, admin_user.id,
        notification_title, notification_title, notification_message, notification_message,
        notification_title, notification_message,
        NEW.module || '_' || LOWER(NEW.action), NEW.entity_type, NEW.entity_id,
        NEW.entity_type, NEW.entity_id, action_url, action_url,
        CASE NEW.severity WHEN 'error' THEN 'high' WHEN 'warning' THEN 'high' WHEN 'critical' THEN 'urgent' ELSE 'normal' END,
        'pending',
        CASE WHEN NEW.actor_id != 'system' AND NEW.actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NEW.actor_id::uuid ELSE NULL END,
        COALESCE(NEW.actor_name, 'System'), NEW.workflow_step,
        CASE NEW.severity WHEN 'error' OR NEW.severity = 'critical' THEN 'error' WHEN 'warning' THEN 'warning' ELSE 'info' END,
        jsonb_build_object('audit_log_id', NEW.id, 'timestamp', NEW.timestamp, 'module', NEW.module, 'action', NEW.action, 'severity', NEW.severity, 'actor_id', NEW.actor_id, 'actor_name', NEW.actor_name, 'entity_name', NEW.entity_name),
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to create notification for admin %: %', admin_user.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$function$;
