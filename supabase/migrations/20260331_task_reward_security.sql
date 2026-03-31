-- Task #10: Reward field authorization security hardening
-- Adds server-side enforcement to prevent non-admin users from
-- setting or modifying task completion reward fields.

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Unique constraint: one materialized task per user+template+date
--    Prevents duplicate task creation and closes race-condition abuse vectors.
CREATE UNIQUE INDEX IF NOT EXISTS personal_tasks_template_user_date_uidx
  ON public.personal_tasks (template_id, assigned_to, daily_task_date)
  WHERE template_id IS NOT NULL;

-- 3. Trigger function: only admins (role IN ('admin','superAdmin','super_admin'))
--    or SECURITY DEFINER server functions can set/update reward fields.
--
--    Authorization logic:
--    - auth.uid() IS NULL → insert comes from a SECURITY DEFINER function
--      (materialise_daily_tasks_for_user); trust it and allow through.
--    - admin role → allow; set reward_set_by = caller's uid.
--    - non-admin authenticated user:
--        INSERT: strip reward fields silently.
--        UPDATE: raise exception.
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  caller_role text;
  reward_being_set boolean;
  caller_uid uuid;
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
    caller_uid := auth.uid();

    -- auth.uid() IS NULL in SECURITY DEFINER context (materialise_daily_tasks_for_user RPC).
    -- These inserts are trusted: reward amounts are read from template rows, not caller input.
    IF caller_uid IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = caller_uid;

    IF caller_role NOT IN ('admin', 'superAdmin', 'super_admin') THEN
      IF TG_OP = 'INSERT' THEN
        -- Non-admin direct insert: strip reward fields silently
        NEW.completion_reward_amount := NULL;
        NEW.completion_reward_currency := 'USD';
        NEW.reward_set_by := NULL;
        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Only admins can modify task reward fields';
      END IF;
    END IF;

    -- Admin is setting/updating a reward: record who authorized it
    NEW.reward_set_by := caller_uid;
  END IF;

  RETURN NEW;
END;
$func$;

-- 4. Attach trigger on both INSERT and UPDATE
DROP TRIGGER IF EXISTS task_reward_fields_guard ON public.personal_tasks;
CREATE TRIGGER task_reward_fields_guard
  BEFORE INSERT OR UPDATE ON public.personal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_reward_fields();

-- 5. Trusted server-side materialisation RPC for daily recurring tasks.
--    SECURITY DEFINER ensures reward amounts are read from template rows (trusted),
--    and auth.uid() returns NULL inside this function (triggers see it as server context).
CREATE OR REPLACE FUNCTION public.materialise_daily_tasks_for_user(
  p_user_id       uuid,
  p_role          text,
  p_department_id uuid DEFAULT NULL
)
RETURNS TABLE(task_id uuid, task_title text, reward_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  rec RECORD;
  today date := CURRENT_DATE;
  role_norm text := lower(regexp_replace(p_role, '[_\s]', '', 'g'));
  existing_count bigint;
  created_id uuid;
BEGIN
  FOR rec IN
    SELECT d.*
    FROM daily_task_definitions d
    WHERE d.active = true
  LOOP
    -- Recurrence day check (weekly = Monday only)
    IF rec.recurrence = 'weekly' AND EXTRACT(DOW FROM today) <> 1 THEN
      CONTINUE;
    END IF;

    -- Role match
    IF rec.role_targets IS NOT NULL AND array_length(rec.role_targets, 1) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(rec.role_targets) r
        WHERE lower(regexp_replace(r, '[_\s]', '', 'g')) = role_norm
      ) THEN CONTINUE; END IF;
    END IF;

    -- Department match
    IF rec.department_id IS NOT NULL THEN
      IF rec.department_id IS DISTINCT FROM p_department_id THEN CONTINUE; END IF;
    END IF;

    -- Deduplication (also enforced by unique index)
    SELECT COUNT(*) INTO existing_count
    FROM personal_tasks
    WHERE template_id = rec.id
      AND assigned_to = p_user_id
      AND daily_task_date = today;

    IF existing_count > 0 THEN CONTINUE; END IF;

    -- Materialise (trusted path: reward comes from template row, not caller)
    INSERT INTO personal_tasks (
      user_id, assigned_to,
      title, description, priority, status, category,
      completion_reward_amount, completion_reward_currency,
      recurrence, template_id, daily_task_date,
      created_at, updated_at
    ) VALUES (
      p_user_id, p_user_id,
      rec.title, rec.description, rec.priority, 'todo', 'recurring',
      rec.reward_amount, rec.reward_currency,
      rec.recurrence, rec.id, today,
      now(), now()
    )
    RETURNING id INTO created_id;

    task_id := created_id;
    task_title := rec.title;
    reward_amount := rec.reward_amount;
    RETURN NEXT;
  END LOOP;
END;
$func$;

-- Grant execute to authenticated users (each user passes their own user_id)
REVOKE ALL ON FUNCTION public.materialise_daily_tasks_for_user(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialise_daily_tasks_for_user(uuid, text, uuid) TO authenticated;

COMMENT ON COLUMN public.personal_tasks.reward_set_by IS
  'UUID of the admin who authorized the completion reward. NULL for server-materialised template tasks (trusted via SECURITY DEFINER). Populated by guard_task_reward_fields trigger when an admin sets a reward.';

COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields.
   SECURITY DEFINER inserts (auth.uid() IS NULL) are trusted — used by materialise_daily_tasks_for_user.
   Admin callers set reward_set_by. Non-admin direct inserts have reward stripped silently. Non-admin updates raise exception.';

COMMENT ON FUNCTION public.materialise_daily_tasks_for_user IS
  'SECURITY DEFINER function to materialise daily recurring tasks.
   Reward amounts are read from template rows — never from caller input.
   Trigger sees auth.uid() IS NULL and trusts the insert.';

-- NOTE: credit-task-reward Edge Function (v3) also deployed with corresponding logic:
--   - reward_set_by IS NOT NULL → admin-authorized credit (path 1)
--   - reward_set_by IS NULL + template_id IS NOT NULL → template-authorized credit (path 2);
--     edge function verifies reward amount matches template row at credit time.
