-- Task Reward Deductions — mirror salary deductions pattern on personal_tasks
-- Additive JSONB columns + snapshot capture on approval + RPC patches.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE everywhere).
--
-- Apply in pactdb (abznugnirnlrqnnfkein) SQL editor.
-- Depends on: 20260401_task_hierarchy_and_payroll.sql, 20260402_task_reward_security.sql,
--             20260416_recurrence_end_date.sql

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Per-task deductions (line items mirror employee_salary_config.deductions)
--    Shape: jsonb array of { name: text, type: 'fixed'|'percent', amount: number }
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS reward_deductions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.personal_tasks.reward_deductions IS
  'Optional deductions applied to completion_reward_amount. Same shape as employee_salary_config.deductions: array of {name, type:fixed|percent, amount}. Empty array = no deductions, full reward credited.';

ALTER TABLE public.daily_task_definitions
  ADD COLUMN IF NOT EXISTS reward_deductions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.daily_task_definitions.reward_deductions IS
  'Default deductions copied to materialised personal_tasks rows. Same shape as personal_tasks.reward_deductions.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Snapshot columns on task_reward_approvals
--    Capture gross/deductions/net at the moment the approval is created so
--    later edits to the task do not retroactively change the audit trail.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.task_reward_approvals
  ADD COLUMN IF NOT EXISTS reward_deductions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reward_deductions_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_net numeric(14,2);

COMMENT ON COLUMN public.task_reward_approvals.reward_deductions_snapshot IS
  'Snapshot of reward_deductions copied from the task at approval creation. Each item enriched with .computed (final amount in currency units).';
COMMENT ON COLUMN public.task_reward_approvals.reward_deductions_total IS
  'Sum of all .computed deduction amounts at approval creation.';
COMMENT ON COLUMN public.task_reward_approvals.reward_net IS
  'reward_amount - reward_deductions_total (clamped at 0). The amount actually credited to the wallet.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Reward guard trigger — extend to admit reward_deductions changes
--    (Currently only watches amount/currency. Without this, non-admins
--    could silently bypass via the new column.)
-- ────────────────────────────────────────────────────────────────────────────

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
    reward_being_set := (
      (NEW.completion_reward_amount IS NOT NULL AND NEW.completion_reward_amount > 0)
      OR (NEW.reward_deductions IS NOT NULL AND jsonb_array_length(NEW.reward_deductions) > 0)
    );
  ELSE
    reward_being_set := (
      NEW.completion_reward_amount IS DISTINCT FROM OLD.completion_reward_amount
      OR NEW.completion_reward_currency IS DISTINCT FROM OLD.completion_reward_currency
      OR NEW.reward_deductions IS DISTINCT FROM OLD.reward_deductions
    );
  END IF;

  IF reward_being_set THEN
    is_trusted_materialise := (current_setting('app.trusted_materialise', true) = 'true');
    IF is_trusted_materialise THEN
      RETURN NEW;
    END IF;

    caller_uid := auth.uid();

    SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = caller_uid;
    caller_role_norm := lower(regexp_replace(COALESCE(caller_role, ''), '[_\s]', '', 'g'));

    IF caller_role_norm NOT IN ('admin', 'superadmin') THEN
      IF TG_OP = 'INSERT' THEN
        NEW.completion_reward_amount := NULL;
        NEW.completion_reward_currency := 'USD';
        NEW.reward_deductions := '[]'::jsonb;
        NEW.reward_set_by := NULL;
        RETURN NEW;
      ELSE
        RAISE EXCEPTION 'Only admins can modify task reward fields';
      END IF;
    END IF;

    NEW.reward_set_by := caller_uid;
  END IF;

  RETURN NEW;
END;
$func$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS task_reward_fields_guard ON public.personal_tasks;
CREATE TRIGGER task_reward_fields_guard
  BEFORE INSERT OR UPDATE ON public.personal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_reward_fields();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. materialise_daily_tasks_for_user — copy reward_deductions from template
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.materialise_daily_tasks_for_user()
RETURNS TABLE(task_id uuid, task_title text, reward_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
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
  IF caller_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT p.role, p.department_id INTO caller_role, caller_dept
  FROM profiles p WHERE p.id = caller_uid;

  IF caller_role IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  role_norm := lower(regexp_replace(caller_role, '[_\s]', '', 'g'));

  PERFORM set_config('app.trusted_materialise', 'true', true);

  FOR rec IN
    SELECT d.* FROM daily_task_definitions d WHERE d.active = true
  LOOP
    IF rec.recurrence = 'weekly' AND EXTRACT(DOW FROM today) <> 1 THEN CONTINUE; END IF;

    IF rec.role_targets IS NOT NULL AND array_length(rec.role_targets, 1) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(rec.role_targets) r
        WHERE lower(regexp_replace(r, '[_\s]', '', 'g')) = role_norm
      ) THEN CONTINUE; END IF;
    END IF;

    IF rec.department_id IS NOT NULL AND rec.department_id IS DISTINCT FROM caller_dept THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO existing_count
    FROM personal_tasks
    WHERE template_id = rec.id AND assigned_to = caller_uid AND daily_task_date = today;

    IF existing_count > 0 THEN CONTINUE; END IF;

    INSERT INTO personal_tasks (
      user_id, assigned_to,
      title, description, priority, status, category,
      completion_reward_amount, completion_reward_currency, reward_deductions,
      recurrence, template_id, daily_task_date,
      created_at, updated_at
    ) VALUES (
      caller_uid, caller_uid,
      rec.title, rec.description, rec.priority, 'todo', 'recurring',
      rec.reward_amount, rec.reward_currency, COALESCE(rec.reward_deductions, '[]'::jsonb),
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

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Helper RPC: compute net for a given gross + deductions array.
--    Used by the credit-task-reward edge function and (optionally) clients
--    that want a server-truth calculation. Pure function, no side effects.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_reward_net(
  p_gross numeric,
  p_deductions jsonb
)
RETURNS TABLE(
  gross numeric,
  deductions_total numeric,
  net numeric,
  deductions_snapshot jsonb
)
LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE
  ded jsonb;
  total numeric := 0;
  computed numeric;
  raw_amount numeric;
  ded_type text;
  enriched jsonb := '[]'::jsonb;
  item jsonb;
BEGIN
  -- Gross is clamped to >= 0 — a negative gross is meaningless for a reward.
  gross := GREATEST(0, COALESCE(p_gross, 0));

  -- Defensive: if not an array (e.g. corrupt row, NULL, scalar) return gross as net.
  IF p_deductions IS NULL
     OR jsonb_typeof(p_deductions) <> 'array'
     OR jsonb_array_length(p_deductions) = 0 THEN
    deductions_total := 0;
    net := gross;
    deductions_snapshot := '[]'::jsonb;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR ded IN SELECT * FROM jsonb_array_elements(p_deductions) LOOP
    -- Skip rows that aren't objects.
    CONTINUE WHEN ded IS NULL OR jsonb_typeof(ded) <> 'object';

    -- Safe numeric parse — non-numeric / NaN-like text becomes 0 instead of raising.
    BEGIN
      raw_amount := COALESCE((ded->>'amount')::numeric, 0);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      raw_amount := 0;
    END;

    -- Postgres numeric DOES accept the literal 'NaN' as a valid value (it does
    -- NOT raise invalid_text_representation), so we have to filter it explicitly.
    -- The IEEE NaN identity (x <> x) catches it portably.
    IF raw_amount IS NULL OR raw_amount <> raw_amount THEN
      raw_amount := 0;
    END IF;

    -- Negative amounts make no sense for a deduction. Clamp at 0.
    IF raw_amount < 0 THEN raw_amount := 0; END IF;

    ded_type := COALESCE(ded->>'type', 'fixed');
    IF ded_type = 'percent' THEN
      -- Clamp percent to [0, 100] so a corrupt 9999% row can't credit a negative net.
      IF raw_amount > 100 THEN raw_amount := 100; END IF;
      computed := gross * raw_amount / 100;
    ELSE
      computed := raw_amount;
    END IF;

    -- Final per-line clamp (defensive — should already be >= 0).
    IF computed < 0 THEN computed := 0; END IF;

    total := total + computed;
    item := ded || jsonb_build_object('computed', round(computed::numeric, 2));
    enriched := enriched || jsonb_build_array(item);
  END LOOP;

  deductions_total := round(total::numeric, 2);
  net := GREATEST(0, gross - deductions_total);
  deductions_snapshot := enriched;
  RETURN NEXT;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.compute_reward_net(numeric, jsonb) TO authenticated;

COMMENT ON FUNCTION public.compute_reward_net(numeric, jsonb) IS
  'Pure helper. Given a gross amount and a jsonb deductions array of {name,type,amount}, returns gross/total/net/snapshot. Mirrors the salary deductions calculation. Used by credit-task-reward edge function.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Auto-snapshot on task_reward_approvals INSERT
--    When the approval row is created (by existing trigger on personal_tasks),
--    capture the deductions snapshot + totals from the task row.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_reward_deductions_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  task_deductions jsonb;
  calc RECORD;
BEGIN
  IF NEW.reward_deductions_snapshot IS NOT NULL
     AND jsonb_array_length(NEW.reward_deductions_snapshot) > 0 THEN
    RETURN NEW; -- caller already populated; respect it
  END IF;

  SELECT COALESCE(reward_deductions, '[]'::jsonb) INTO task_deductions
  FROM personal_tasks WHERE id = NEW.task_id;

  SELECT * INTO calc
  FROM compute_reward_net(NEW.reward_amount, COALESCE(task_deductions, '[]'::jsonb));

  NEW.reward_deductions_snapshot := calc.deductions_snapshot;
  NEW.reward_deductions_total    := calc.deductions_total;
  NEW.reward_net                 := calc.net;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS task_reward_approval_snapshot ON public.task_reward_approvals;
CREATE TRIGGER task_reward_approval_snapshot
  BEFORE INSERT ON public.task_reward_approvals
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_reward_deductions_on_approval();

COMMENT ON FUNCTION public.snapshot_reward_deductions_on_approval() IS
  'BEFORE INSERT trigger on task_reward_approvals. Reads the task row, computes deductions/net via compute_reward_net, populates the snapshot columns. Caller-supplied snapshots are respected (idempotent on retries).';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Backfill existing approval rows that have no snapshot yet
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.task_reward_approvals tra
SET
  reward_deductions_snapshot = calc.deductions_snapshot,
  reward_deductions_total    = calc.deductions_total,
  reward_net                 = calc.net
FROM (
  SELECT a.id, c.deductions_snapshot, c.deductions_total, c.net
  FROM public.task_reward_approvals a
  LEFT JOIN public.personal_tasks t ON t.id = a.task_id
  CROSS JOIN LATERAL public.compute_reward_net(
    a.reward_amount,
    COALESCE(t.reward_deductions, '[]'::jsonb)
  ) c
  WHERE a.reward_net IS NULL
) calc
WHERE tra.id = calc.id;
