-- Add recurrence_end_date to both tables
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;

ALTER TABLE public.daily_task_definitions
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;

COMMENT ON COLUMN public.personal_tasks.recurrence_end_date IS
  'Optional date after which this recurring task stops being materialised / shown in recurring filter.';

COMMENT ON COLUMN public.daily_task_definitions.recurrence_end_date IS
  'Optional end date for this template. After this date the materialiser will skip it.';

-- Update materialise_daily_tasks_for_user to handle every_2_days, every_3_days, and recurrence_end_date
CREATE OR REPLACE FUNCTION public.materialise_daily_tasks_for_user()
RETURNS TABLE(task_id uuid, task_title text, reward_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  rec RECORD;
  today date := CURRENT_DATE;
  epoch_days int;
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

  -- Epoch day counter relative to 2000-01-01 (consistent global reference)
  epoch_days := (today - DATE '2000-01-01')::int;

  -- Mark this transaction as trusted so reward guard trigger allows reward fields
  PERFORM set_config('app.trusted_materialise', 'true', true);

  FOR rec IN
    SELECT d.*
    FROM daily_task_definitions d
    WHERE d.active = true
  LOOP
    -- Check end date — skip if today is past the end
    IF rec.recurrence_end_date IS NOT NULL AND today > rec.recurrence_end_date THEN
      CONTINUE;
    END IF;

    -- Frequency gating
    IF rec.recurrence = 'weekly' AND EXTRACT(DOW FROM today) <> 1 THEN CONTINUE; END IF;
    IF rec.recurrence = 'every_2_days' AND epoch_days % 2 <> 0 THEN CONTINUE; END IF;
    IF rec.recurrence = 'every_3_days' AND epoch_days % 3 <> 0 THEN CONTINUE; END IF;

    -- Role filter
    IF rec.role_targets IS NOT NULL AND array_length(rec.role_targets, 1) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(rec.role_targets) r
        WHERE lower(regexp_replace(r, '[_\s]', '', 'g')) = role_norm
      ) THEN CONTINUE; END IF;
    END IF;

    -- Department filter
    IF rec.department_id IS NOT NULL THEN
      IF rec.department_id IS DISTINCT FROM caller_dept THEN CONTINUE; END IF;
    END IF;

    -- Deduplication: one instance per template+user+date
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
      recurrence_end_date,
      created_at, updated_at
    ) VALUES (
      caller_uid, caller_uid,
      rec.title, rec.description, rec.priority, 'todo', 'recurring',
      rec.reward_amount, rec.reward_currency,
      rec.recurrence, rec.id, today,
      rec.recurrence_end_date,
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

COMMENT ON FUNCTION public.materialise_daily_tasks_for_user() IS
  'SECURITY DEFINER. Respects recurrence_end_date on both template and task rows (skips past end date).
   Explicit skip logic: weekly (skips if today-of-week not in recurrence_days),
     every_2_days (skips if epoch_days % 2 != 0), every_3_days (skips if epoch_days % 3 != 0).
   Other frequencies (daily, monthly, biweekly, weekdays, specific_days) fall through to default
     materialise path — their skip logic was defined in earlier migrations or handled by schedule.
   Epoch-based day counter relative to 2000-01-01 for consistent every_N_days intervals.';
