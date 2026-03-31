-- Task #10: Reward field authorization security hardening
-- Adds server-side enforcement to prevent non-admin users from
-- setting or modifying task completion reward fields.

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Trigger function: only admins (role IN ('admin','superAdmin','super_admin'))
--    can update completion_reward_amount / completion_reward_currency.
--    When they do, reward_set_by is automatically set to auth.uid().
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_role text;
BEGIN
  IF (NEW.completion_reward_amount IS DISTINCT FROM OLD.completion_reward_amount
      OR NEW.completion_reward_currency IS DISTINCT FROM OLD.completion_reward_currency)
  THEN
    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF caller_role NOT IN ('admin', 'superAdmin', 'super_admin') THEN
      RAISE EXCEPTION 'Only admins can modify task reward fields' USING ERRCODE = '42501';
    END IF;

    -- Record which admin authorized the reward
    NEW.reward_set_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS task_reward_fields_guard ON public.personal_tasks;
CREATE TRIGGER task_reward_fields_guard
  BEFORE UPDATE ON public.personal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_reward_fields();

COMMENT ON COLUMN public.personal_tasks.reward_set_by IS
  'UUID of the admin who authorized the completion reward. Populated automatically by guard_task_reward_fields trigger.';
COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields. Only profiles with role admin/superAdmin/super_admin can update completion_reward_amount or completion_reward_currency.';
