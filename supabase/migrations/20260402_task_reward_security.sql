-- Task #10: Reward field authorization security hardening
-- MUST run AFTER 20260401_task_hierarchy_and_payroll.sql (which adds
-- template_id, daily_task_date, completion_reward_amount, etc.)

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Unique constraint: one materialized task per user+template+date
--    Prevents duplicate task creation and closes race-condition abuse vectors.
CREATE UNIQUE INDEX IF NOT EXISTS personal_tasks_template_user_date_uidx
  ON public.personal_tasks (template_id, assigned_to, daily_task_date)
  WHERE template_id IS NOT NULL;

-- 3. Trigger function: only admins (role IN ('admin','superAdmin','super_admin'))
--    or trusted SECURITY DEFINER functions can set/update reward fields.
--
--    Trusted context detection: the RPC sets app.trusted_materialise='true' (LOCAL)
--    before inserting, and the trigger checks this session variable.
--    Using a session variable (set_config) avoids auth.uid() IS NULL assumptions
--    that are unreliable in Supabase (auth.uid() remains set even in SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  caller_role text;
  reward_being_set boolean;
  caller_uid uuid;
  is_trusted_materialise boolean;
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
    -- Check trusted materialisation context (set by SECURITY DEFINER RPC, transaction-scoped)
    is_trusted_materialise := (current_setting('app.trusted_materialise', true) = 'true');

    IF is_trusted_materialise THEN
      -- RPC verified eligibility and set context; allow reward through
      RETURN NEW;
    END IF;

    caller_uid := auth.uid();

    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = caller_uid;

    IF caller_role IS NULL OR caller_role NOT IN ('admin', 'superAdmin', 'super_admin') THEN
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
--    Security properties:
--    - SECURITY DEFINER: runs as DB owner for privileged table access
--    - Zero caller-supplied parameters: user identity, role, and department ALL read
--      from the caller's auth.uid() profiles row (cannot be spoofed by caller)
--    - Reward amounts read from daily_task_definitions row (not from caller)
--    - Sets app.trusted_materialise='true' (transaction-LOCAL) before inserts
--      so the reward-guard trigger allows reward fields through
--    - Only eligible templates (role+dept match from profile) are materialised
--    - Deduplication enforced in SQL + unique index
CREATE OR REPLACE FUNCTION public.materialise_daily_tasks_for_user()
RETURNS TABLE(task_id uuid, task_title text, reward_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  rec RECORD;
  today date := CURRENT_DATE;
  caller_uid uuid;
  caller_role text;
  caller_dept uuid;
  role_norm text;
  existing_count bigint;
  created_id uuid;
BEGIN
  -- Enforce: must be called by an authenticated user
  caller_uid := auth.uid();
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Derive role and department from the profile row (trusted, not caller input)
  SELECT p.role, p.department_id
  INTO caller_role, caller_dept
  FROM profiles p
  WHERE p.id = caller_uid;

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  role_norm := lower(regexp_replace(caller_role, '[_\s]', '', 'g'));

  -- Mark this transaction as trusted so the reward guard trigger allows reward fields
  -- for the inserts we are about to do (transaction-LOCAL, resets after commit/rollback)
  PERFORM set_config('app.trusted_materialise', 'true', true);

  FOR rec IN
    SELECT d.*
    FROM daily_task_definitions d
    WHERE d.active = true
  LOOP
    -- Recurrence day check (weekly = Monday only)
    IF rec.recurrence = 'weekly' AND EXTRACT(DOW FROM today) <> 1 THEN CONTINUE; END IF;

    -- Role match (against caller's actual role from profile, not caller-supplied)
    IF rec.role_targets IS NOT NULL AND array_length(rec.role_targets, 1) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(rec.role_targets) r
        WHERE lower(regexp_replace(r, '[_\s]', '', 'g')) = role_norm
      ) THEN CONTINUE; END IF;
    END IF;

    -- Department match (against caller's actual department from profile)
    IF rec.department_id IS NOT NULL THEN
      IF rec.department_id IS DISTINCT FROM caller_dept THEN CONTINUE; END IF;
    END IF;

    -- Deduplication (also enforced by unique index)
    SELECT COUNT(*) INTO existing_count
    FROM personal_tasks
    WHERE template_id = rec.id
      AND assigned_to = caller_uid
      AND daily_task_date = today;

    IF existing_count > 0 THEN CONTINUE; END IF;

    -- Materialise (reward from template row, not from caller)
    INSERT INTO personal_tasks (
      user_id, assigned_to,
      title, description, priority, status, category,
      completion_reward_amount, completion_reward_currency,
      recurrence, template_id, daily_task_date,
      created_at, updated_at
    ) VALUES (
      caller_uid, caller_uid,
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

  -- Clear trusted context (belt-and-suspenders; already transaction-scoped)
  PERFORM set_config('app.trusted_materialise', 'false', true);
END;
$func$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.materialise_daily_tasks_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialise_daily_tasks_for_user() TO authenticated;

-- Drop old parameterised version if it exists (replaced by zero-param secure version)
DROP FUNCTION IF EXISTS public.materialise_daily_tasks_for_user(uuid, text, uuid);

COMMENT ON COLUMN public.personal_tasks.reward_set_by IS
  'UUID of the admin who authorized the completion reward. NULL for server-materialised template tasks. Populated by guard_task_reward_fields trigger when an admin sets a reward.';

COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields.
   Trusted materialisation context: checks app.trusted_materialise session variable (set by materialise_daily_tasks_for_user RPC).
   Admin callers set reward_set_by. Non-admin direct inserts have reward stripped. Non-admin updates raise exception.';

COMMENT ON FUNCTION public.materialise_daily_tasks_for_user() IS
  'SECURITY DEFINER function. Zero caller-supplied parameters: user id, role, and department all
   read from auth.uid() profile row. Reward amounts from template rows. Sets app.trusted_materialise
   session variable (transaction-LOCAL) so the reward guard trigger allows reward fields.
   Only eligible templates are materialised for the authenticated caller. Dedup via SQL + unique index.';

-- NOTE: credit-task-reward Edge Function (v3) deployed separately with authorization:
--   - reward_set_by IS NOT NULL: admin-authorized credit (path 1)
--   - reward_set_by IS NULL + template_id IS NOT NULL: template task; verifies reward amount
--     matches daily_task_definitions row at credit time (double-verification)
