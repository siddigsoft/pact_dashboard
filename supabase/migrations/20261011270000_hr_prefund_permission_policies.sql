-- Replace hardcoded role-name checks on HR, benefits, salary-advance and
-- pre-funding tables with the canonical resource permissions, so the
-- Permissions tab is the single source of truth. Self-service rules
-- (own rows, interviewers, requesters, fund holders, step assignees) are kept.
-- RESTRICTIVE per-user override ceilings are untouched.

------------------------------------------------------------------------------
-- 1. Salary advances (were open to everyone, including anon)
------------------------------------------------------------------------------
revoke all on public.hr_salary_advances, public.hr_salary_advance_recoveries from anon;

drop policy if exists hr_salary_advances_all on public.hr_salary_advances;
drop policy if exists hr_advance_recoveries_all on public.hr_salary_advance_recoveries;

create policy hsa_read on public.hr_salary_advances for select to authenticated
  using (user_id = (select auth.uid())
      or (select public.current_user_has_resource_permission('payroll', 'read'))
      or (select public.current_user_has_resource_permission('hr', 'read')));
create policy hsa_insert on public.hr_salary_advances for insert to authenticated
  with check ((select public.current_user_has_resource_permission('payroll', 'create')));
create policy hsa_update on public.hr_salary_advances for update to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'update')))
  with check ((select public.current_user_has_resource_permission('payroll', 'update')));
create policy hsa_delete on public.hr_salary_advances for delete to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'delete')));

create policy hsar_read on public.hr_salary_advance_recoveries for select to authenticated
  using (advance_id in (select id from public.hr_salary_advances where user_id = (select auth.uid()))
      or (select public.current_user_has_resource_permission('payroll', 'read'))
      or (select public.current_user_has_resource_permission('hr', 'read')));
create policy hsar_insert on public.hr_salary_advance_recoveries for insert to authenticated
  with check ((select public.current_user_has_resource_permission('payroll', 'create')));
create policy hsar_update on public.hr_salary_advance_recoveries for update to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'update')))
  with check ((select public.current_user_has_resource_permission('payroll', 'update')));
create policy hsar_delete on public.hr_salary_advance_recoveries for delete to authenticated
  using ((select public.current_user_has_resource_permission('payroll', 'delete')));

------------------------------------------------------------------------------
-- 2. HR / benefits tables owned entirely by HR editors
------------------------------------------------------------------------------
DO $$
DECLARE
  -- table, resource, read rule (null = keep existing SELECT policies), policies to drop
  spec record;
  perm constant text := '(select public.current_user_has_resource_permission(%L, %L))';
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('hr_headcount_plans',     'hr',       format(perm, 'hr', 'read'),                           ARRAY['hr_headcount_plans_select','hr_headcount_plans_write']),
      ('hr_disciplinary_cases',  'hr',       format(perm, 'hr', 'read'),                           ARRAY['hr_disciplinary_cases_all']),
      ('hr_candidates',          'hr',       format(perm, 'hr', 'read'),                           ARRAY['hr_candidates_select','hr_candidates_write']),
      ('hr_onboarding_records',  'hr',       format(perm, 'hr', 'read'),                           ARRAY['hr_onboarding_all']),
      ('training_records',       'hr',       '(user_id = (select auth.uid())) or ' || format(perm, 'hr', 'read'), ARRAY['training_read','training_write']),
      ('hr_job_postings',        'hr',       null,                                                 ARRAY['hr_job_postings_write']),
      ('positions',              'hr',       null,                                                 ARRAY['positions_admin_write']),
      ('hr_compensation_grades', 'hr',       null,                                                 ARRAY['hcg_write']),
      ('hr_benefit_plans',       'benefits', null,                                                 ARRAY['hr_benefit_plans_write']),
      ('hr_benefit_enrollments', 'benefits', '(user_id = (select auth.uid())) or ' || format(perm, 'benefits', 'read'), ARRAY['hr_benefit_enrollments_select_own','hr_benefit_enrollments_write'])
    ) AS t(tbl, res, read_rule, drops)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NULL THEN CONTINUE; END IF;
    FOR i IN 1 .. coalesce(array_length(spec.drops, 1), 0) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.drops[i], spec.tbl);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', spec.tbl);
    IF spec.read_rule IS NOT NULL THEN
      EXECUTE format('CREATE POLICY perm_read ON public.%I FOR SELECT TO authenticated USING (%s)', spec.tbl, spec.read_rule);
    END IF;
    EXECUTE format('CREATE POLICY perm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', spec.tbl, format(perm, spec.res, 'create'));
    EXECUTE format('CREATE POLICY perm_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', spec.tbl, format(perm, spec.res, 'update'), format(perm, spec.res, 'update'));
    EXECUTE format('CREATE POLICY perm_delete ON public.%I FOR DELETE TO authenticated USING (%s)', spec.tbl, format(perm, spec.res, 'delete'));
  END LOOP;
END $$;

-- EOSB settings are edited by HR or payroll.
drop policy if exists hr_eosb_settings_write on public.hr_eosb_settings;
create policy perm_write on public.hr_eosb_settings for all to authenticated
  using ((select public.current_user_has_resource_permission('hr', 'update'))
      or (select public.current_user_has_resource_permission('payroll', 'update')))
  with check ((select public.current_user_has_resource_permission('hr', 'update'))
      or (select public.current_user_has_resource_permission('payroll', 'update')));

------------------------------------------------------------------------------
-- 3. Recruitment self-service tables: keep own-row rules, swap the role lists
------------------------------------------------------------------------------
drop policy if exists hr_jr_delete on public.hr_job_requisitions;
create policy hr_jr_delete on public.hr_job_requisitions for delete to authenticated
  using ((requested_by = (select auth.uid()) and status = 'draft')
      or (select public.current_user_has_resource_permission('hr', 'delete')));

drop policy if exists hr_jr_update_admin on public.hr_job_requisitions;
create policy hr_jr_update_admin on public.hr_job_requisitions for update to authenticated
  using ((select public.current_user_has_resource_permission('hr', 'update')))
  with check ((select public.current_user_has_resource_permission('hr', 'update')));

drop policy if exists hr_jr_update_manager on public.hr_job_requisitions;
create policy hr_jr_update_manager on public.hr_job_requisitions for update to authenticated
  using (status = 'pending_manager' and (select public.current_user_has_resource_permission('hr', 'approve')))
  with check (status in ('pending_hr', 'rejected') and (select public.current_user_has_resource_permission('hr', 'approve')));

drop policy if exists hr_slots_select on public.hr_interview_slots;
drop policy if exists hr_slots_insert on public.hr_interview_slots;
drop policy if exists hr_slots_update on public.hr_interview_slots;
drop policy if exists hr_slots_delete on public.hr_interview_slots;
create policy hr_slots_select on public.hr_interview_slots for select to authenticated
  using ((select auth.uid()) = any (interviewer_ids) or created_by = (select auth.uid())
      or (select public.current_user_has_resource_permission('hr', 'read')));
create policy hr_slots_insert on public.hr_interview_slots for insert to authenticated
  with check ((select public.current_user_has_resource_permission('hr', 'create')));
create policy hr_slots_update on public.hr_interview_slots for update to authenticated
  using (created_by = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'update')))
  with check (created_by = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'update')));
create policy hr_slots_delete on public.hr_interview_slots for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'delete')));

drop policy if exists hr_scores_select on public.hr_candidate_scores;
drop policy if exists hr_scores_insert on public.hr_candidate_scores;
drop policy if exists hr_scores_update on public.hr_candidate_scores;
drop policy if exists hr_scores_delete on public.hr_candidate_scores;
create policy hr_scores_select on public.hr_candidate_scores for select to authenticated
  using (interviewer_id = (select auth.uid())
      or exists (select 1 from public.hr_interview_slots s
                 where s.candidate_id = hr_candidate_scores.candidate_id
                   and (select auth.uid()) = any (s.interviewer_ids))
      or (select public.current_user_has_resource_permission('hr', 'read')));
create policy hr_scores_insert on public.hr_candidate_scores for insert to authenticated
  with check (interviewer_id = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'create')));
create policy hr_scores_update on public.hr_candidate_scores for update to authenticated
  using (interviewer_id = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'update')))
  with check (interviewer_id = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'update')));
create policy hr_scores_delete on public.hr_candidate_scores for delete to authenticated
  using (interviewer_id = (select auth.uid()) or (select public.current_user_has_resource_permission('hr', 'delete')));

------------------------------------------------------------------------------
-- 4. Pre-funding: drop role lists (incl. auditor write), use pre_funding perms.
--    Org-wide read stays limited to explicit read grants plus pre_funding:create
--    holders (the finance team); holders/assignees keep their own-row policies.
------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  perm constant text := '(select public.current_user_has_resource_permission(''pre_funding'', %L))';
BEGIN
  DROP POLICY IF EXISTS "Finance admins full access pre_fund_allocations" ON public.pre_fund_allocations;
  DROP POLICY IF EXISTS "Finance admins full access pre_fund_approval_steps" ON public.pre_fund_approval_steps;
  DROP POLICY IF EXISTS "Finance admins full access pre_fund_requests" ON public.pre_fund_requests;
  DROP POLICY IF EXISTS pf_alloc_admin_all ON public.pre_fund_allocations;
  DROP POLICY IF EXISTS pf_steps_finance ON public.pre_fund_approval_steps;
  DROP POLICY IF EXISTS pf_bank_unmatched_access ON public.pre_fund_bank_unmatched;
  DROP POLICY IF EXISTS pf_period_types_finance ON public.pre_fund_period_types;
  DROP POLICY IF EXISTS pf_recons_finance ON public.pre_fund_reconciliations;
  DROP POLICY IF EXISTS pf_requests_finance ON public.pre_fund_requests;
  DROP POLICY IF EXISTS pf_settings_finance ON public.pre_fund_settings;
  DROP POLICY IF EXISTS pf_transactions_finance ON public.pre_fund_transactions;

  FOREACH t IN ARRAY ARRAY['pre_fund_requests','pre_fund_allocations','pre_fund_transactions',
                           'pre_fund_reconciliations','pre_fund_approval_steps','pre_fund_bank_unmatched',
                           'pre_fund_period_types','pre_fund_settings'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    IF t NOT IN ('pre_fund_settings') THEN
      EXECUTE format('CREATE POLICY pf_perm_read ON public.%I FOR SELECT TO authenticated USING (%s)', t, format(perm, 'create'));
    END IF;
    EXECUTE format('CREATE POLICY pf_perm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t, format(perm, 'create'));
    EXECUTE format('CREATE POLICY pf_perm_update ON public.%I FOR UPDATE TO authenticated USING (%s OR %s) WITH CHECK (%s OR %s)',
      t, format(perm, 'update'), format(perm, 'approve'), format(perm, 'update'), format(perm, 'approve'));
    EXECUTE format('CREATE POLICY pf_perm_delete ON public.%I FOR DELETE TO authenticated USING (%s)', t, format(perm, 'delete'));
  END LOOP;
END $$;
