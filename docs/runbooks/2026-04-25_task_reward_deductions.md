# Runbook — Task Reward Deductions (2026-04-25)

Adds salary-style deductions to task completion rewards.

## What changes
- **personal_tasks** gets `reward_deductions jsonb NOT NULL DEFAULT '[]'`
- **daily_task_definitions** gets the same column (so templates carry deductions to materialised tasks)
- **task_reward_approvals** gets snapshot columns: `reward_deductions_snapshot`, `reward_deductions_total`, `reward_net`
- New helper RPC `compute_reward_net(gross, deductions) → (gross, deductions_total, net, deductions_snapshot)`
- Existing `guard_task_reward_fields` trigger extended to admit `reward_deductions` changes (admin-only, same authorization model)
- Existing `materialise_daily_tasks_for_user` RPC patched to copy `reward_deductions` from template
- New `snapshot_reward_deductions_on_approval` trigger captures the breakdown when an approval row is inserted
- All existing approval rows are backfilled with `reward_net = reward_amount` (no deductions, since none were possible before)

## Apply order
1. Open pactdb (abznugnirnlrqnnfkein) SQL editor.
2. Paste the entire contents of `supabase/migrations/20260425_task_reward_deductions.sql`.
3. Run. Should complete in under one second.
4. Spot-check:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'personal_tasks'
     AND column_name = 'reward_deductions';
   -- expect: reward_deductions | jsonb | '[]'::jsonb

   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'task_reward_approvals'
     AND column_name IN ('reward_deductions_snapshot', 'reward_deductions_total', 'reward_net');
   -- expect 3 rows

   -- Smoke test the helper RPC
   SELECT * FROM public.compute_reward_net(
     100,
     '[{"name":"Tax","type":"percent","amount":10},{"name":"Social","type":"fixed","amount":5}]'::jsonb
   );
   -- expect: gross=100, deductions_total=15.00, net=85.00, snapshot has both items + .computed values
   ```

## Edge function deploy (REQUIRED — same day)
The wallet credit edge function must be redeployed so it credits **net** instead of **gross**.

From your local machine (not Replit):
```bash
supabase functions deploy credit-task-reward --project-ref abznugnirnlrqnnfkein
```

Without this, the SQL is harmless (deductions will simply not be applied to wallet credits), but the new UI will show net amounts that don't match what is actually credited.

## Rollback
Drop the columns (data is preserved, just hidden):
```sql
ALTER TABLE public.personal_tasks DROP COLUMN IF EXISTS reward_deductions;
ALTER TABLE public.daily_task_definitions DROP COLUMN IF EXISTS reward_deductions;
ALTER TABLE public.task_reward_approvals
  DROP COLUMN IF EXISTS reward_deductions_snapshot,
  DROP COLUMN IF EXISTS reward_deductions_total,
  DROP COLUMN IF EXISTS reward_net;
DROP TRIGGER IF EXISTS task_reward_approval_snapshot ON public.task_reward_approvals;
DROP FUNCTION IF EXISTS public.snapshot_reward_deductions_on_approval();
DROP FUNCTION IF EXISTS public.compute_reward_net(numeric, jsonb);
```
The previous `guard_task_reward_fields` and `materialise_daily_tasks_for_user` definitions live in `20260402_task_reward_security.sql` — re-paste that file to revert those.
