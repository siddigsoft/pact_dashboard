-- Task #10: Reward field authorization security hardening
-- Adds server-side enforcement to prevent non-admin users from
-- setting or modifying task completion reward fields.

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Trigger function: only admins (role IN ('admin','superAdmin','super_admin'))
--    can set/update completion_reward_amount / completion_reward_currency.
--    - On INSERT from a recurring template: reward inherited from template (amount verified)
--    - On INSERT by non-admin: reward fields are silently stripped (set to null)
--    - On UPDATE by non-admin: raises exception
--    - When admin sets reward: reward_set_by is automatically set to auth.uid()
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  caller_role text;
  reward_being_set boolean;
  tmpl_reward numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    reward_being_set := (NEW.completion_reward_amount IS NOT NULL AND NEW.completion_reward_amount > 0);
  ELSE
    reward_being_set := (
      NEW.completion_reward_amount IS DISTINCT FROM OLD.completion_reward_amount
      OR NEW.completion_reward_currency IS DISTINCT FROM OLD.completion_reward_currency
    );
  END IF;

  IF reward_being_set THEN
    -- Template-materialised tasks: allow reward if amount matches the template definition
    IF TG_OP = 'INSERT' AND NEW.template_id IS NOT NULL THEN
      SELECT reward_amount INTO tmpl_reward
      FROM public.daily_task_definitions
      WHERE id = NEW.template_id;

      IF tmpl_reward IS NOT NULL AND ABS(COALESCE(NEW.completion_reward_amount, 0) - tmpl_reward) < 0.001 THEN
        -- Reward matches template — allow without individual admin check
        NEW.reward_set_by := NULL; -- template-authorised (no specific admin uid)
        RETURN NEW;
      END IF;
    END IF;

    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF caller_role NOT IN ('admin', 'superAdmin', 'super_admin') THEN
      IF TG_OP = 'INSERT' THEN
        -- Non-admins cannot create tasks with rewards; strip them silently
        NEW.completion_reward_amount := NULL;
        NEW.completion_reward_currency := 'USD';
        NEW.reward_set_by := NULL;
        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Only admins can modify task reward fields';
      END IF;
    END IF;

    -- Admin is setting/updating a reward: record who authorized it
    NEW.reward_set_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$func$;

-- 3. Attach trigger on both INSERT and UPDATE
DROP TRIGGER IF EXISTS task_reward_fields_guard ON public.personal_tasks;
CREATE TRIGGER task_reward_fields_guard
  BEFORE INSERT OR UPDATE ON public.personal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_reward_fields();

COMMENT ON COLUMN public.personal_tasks.reward_set_by IS
  'UUID of the admin who authorized the completion reward, or NULL for template-inherited rewards. Populated automatically by guard_task_reward_fields trigger.';
COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields on INSERT and UPDATE.
   Special case: recurring template tasks inherit reward amount directly from daily_task_definitions (amount is verified against template before allowing).
   Only profiles with role admin/superAdmin/super_admin can set arbitrary rewards.
   On INSERT by non-admin without a matching template, reward fields are silently stripped.
   On UPDATE by non-admin, exception is raised.
   reward_set_by is auto-populated by the trigger when an admin sets a reward.';

-- NOTE: credit-task-reward Edge Function also updated (v3) to allow reward credit for:
--   1. Tasks where reward_set_by IS NOT NULL (admin-manually-set reward)
--   2. Tasks where template_id IS NOT NULL (reward inherited from daily_task_definitions;
--      the trigger verified the amount matches the template at insert time)
-- Template-materialized task rewards (reward_set_by IS NULL, template_id IS NOT NULL)
-- are considered admin-authorized because they originate from admin-created templates.
