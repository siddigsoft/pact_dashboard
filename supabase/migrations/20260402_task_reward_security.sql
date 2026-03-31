-- Task #10: Reward field authorization security hardening
-- MUST run AFTER 20260401_task_hierarchy_and_payroll.sql (which adds
-- template_id, daily_task_date, completion_reward_amount, etc.)

-- 1. Track which admin set a reward on a task
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Unique constraint: one materialized task per user+template+date
CREATE UNIQUE INDEX IF NOT EXISTS personal_tasks_template_user_date_uidx
  ON public.personal_tasks (template_id, assigned_to, daily_task_date)
  WHERE template_id IS NOT NULL;

-- 3. Trigger function: only admins can set/update reward fields.
--    Role normalization: strips underscores/spaces, lowercases → handles all variants:
--    'admin', 'superAdmin', 'super_admin', 'superadmin' all map to 'admin'/'superadmin'.
--    Trusted context: app.trusted_materialise session variable (set by SECURITY DEFINER RPC).
CREATE OR REPLACE FUNCTION public.guard_task_reward_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  caller_role text;
  caller_role_norm text;
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
      -- RPC verified eligibility; allow reward through
      RETURN NEW;
    END IF;

    caller_uid := auth.uid();

    SELECT p.role INTO caller_role
    FROM public.profiles p
    WHERE p.id = caller_uid;

    -- Normalize role: lowercase + strip underscores/spaces
    -- Canonical admin roles: 'admin', 'superadmin' (covers superAdmin, super_admin, superadmin)
    caller_role_norm := lower(regexp_replace(COALESCE(caller_role, ''), '[_\s]', '', 'g'));

    IF caller_role_norm NOT IN ('admin', 'superadmin') THEN
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

    -- Admin: record who authorized it
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
--    - SECURITY DEFINER: runs as DB owner for privileged table access
--    - Zero caller-supplied parameters: identity, role, dept all from auth.uid() profile row
--    - Reward amounts from template rows (not from caller)
--    - Sets app.trusted_materialise='true' (transaction-LOCAL) before inserts
--    - Only eligible templates (role+dept match) are materialised
--    - Deduplication: SQL check + unique index
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
  caller_uid := auth.uid();
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role, p.department_id
  INTO caller_role, caller_dept
  FROM profiles p
  WHERE p.id = caller_uid;

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  role_norm := lower(regexp_replace(caller_role, '[_\s]', '', 'g'));

  -- Mark this transaction as trusted so reward guard trigger allows reward fields
  PERFORM set_config('app.trusted_materialise', 'true', true);

  FOR rec IN
    SELECT d.*
    FROM daily_task_definitions d
    WHERE d.active = true
  LOOP
    IF rec.recurrence = 'weekly' AND EXTRACT(DOW FROM today) <> 1 THEN CONTINUE; END IF;

    IF rec.role_targets IS NOT NULL AND array_length(rec.role_targets, 1) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(rec.role_targets) r
        WHERE lower(regexp_replace(r, '[_\s]', '', 'g')) = role_norm
      ) THEN CONTINUE; END IF;
    END IF;

    IF rec.department_id IS NOT NULL THEN
      IF rec.department_id IS DISTINCT FROM caller_dept THEN CONTINUE; END IF;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM personal_tasks
    WHERE template_id = rec.id
      AND assigned_to = caller_uid
      AND daily_task_date = today;

    IF existing_count > 0 THEN CONTINUE; END IF;

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

  PERFORM set_config('app.trusted_materialise', 'false', true);
END;
$func$;

REVOKE ALL ON FUNCTION public.materialise_daily_tasks_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialise_daily_tasks_for_user() TO authenticated;

DROP FUNCTION IF EXISTS public.materialise_daily_tasks_for_user(uuid, text, uuid);

COMMENT ON COLUMN public.personal_tasks.reward_set_by IS
  'UUID of the admin who authorized the completion reward. NULL for server-materialised template tasks. Populated by guard_task_reward_fields trigger.';

COMMENT ON FUNCTION public.guard_task_reward_fields() IS
  'Prevents non-admin users from setting/changing task reward fields.
   Trusted context: app.trusted_materialise session variable (set by materialise_daily_tasks_for_user).
   Role check: normalized via lower+strip_underscore to handle admin/superAdmin/super_admin/superadmin.
   Admin callers: reward_set_by set. Non-admin inserts: reward stripped. Non-admin updates: exception.';

COMMENT ON FUNCTION public.materialise_daily_tasks_for_user() IS
  'SECURITY DEFINER. Zero caller params: uid/role/dept from auth.uid() profile row.
   Reward from template rows. Sets app.trusted_materialise (transaction-LOCAL).
   Dedup via SQL + unique index.';

-- NOTE: credit-task-reward Edge Function (v4):
--   - reward_set_by IS NOT NULL: admin-authorized (path 1)
--   - reward_set_by IS NULL + template_id IS NOT NULL: materialized by trusted RPC;
--     stored amount is authoritative (snapshot semantics, no re-verification of template)
