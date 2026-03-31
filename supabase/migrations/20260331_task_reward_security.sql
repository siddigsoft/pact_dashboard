-- Task #10: Reward field authorization security hardening
-- Adds server-side enforcement to prevent non-admin users from
-- setting or modifying task completion reward fields.

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Trigger function: only admins (role IN ('admin','superAdmin','super_admin'))
--    can set/update completion_reward_amount / completion_reward_currency.
--    - On INSERT: non-admin reward fields are silently stripped (set to null)
--    - On UPDATE: non-admin attempt raises exception
--    - When admin sets reward: reward_set_by is automatically set to auth.uid()
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  caller_role text;
  reward_being_set boolean;
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
  'UUID of the admin who authorized the completion reward. Populated automatically by guard_task_reward_fields trigger.';
COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields on INSERT and UPDATE. Only profiles with role admin/superAdmin/super_admin can use completion_reward_amount. On INSERT by non-admin, reward fields are silently stripped. reward_set_by is auto-populated by the trigger when an admin sets a reward.';
