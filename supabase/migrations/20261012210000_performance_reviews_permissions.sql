-- Performance reviews get their own permission resource (performance_reviews:*)
-- and the four review tables drop their open (true) and role-name rules.

alter table public.permissions drop constraint if exists permissions_resource_check;
alter table public.permissions add constraint permissions_resource_check check (
  resource = any (array[
    'users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs',
    'projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations',
    'coverage_map', 'safety', 'incidents', 'equipment', 'finances', 'cost_submissions',
    'wallets', 'down_payments', 'pre_funding', 'accounting', 'fixed_assets', 'procurement',
    'transactions', 'signatures', 'reports', 'crm', 'surveys', 'tasks', 'notifications',
    'calendar', 'hr', 'hr_analytics', 'payroll', 'benefits', 'leave', 'pulse_surveys',
    'succession', 'integrations', 'broadcast', 'whatsapp', 'incentives',
    'performance_reviews'
  ]::text[])
);

insert into public.permissions (role_id, resource, action)
select r.id, 'performance_reviews', a.action
from public.roles r
cross join (values ('read'), ('create'), ('update'), ('approve'), ('delete'), ('export')) a(action)
where r.name = 'admin'
on conflict (role_id, resource, action) do nothing;

revoke all on public.performance_reviews, public.hr_review_self_assessments,
              public.hr_review_peer_nominations, public.hr_review_calibration_adjustments from anon;

-- performance_reviews ---------------------------------------------------------
drop policy if exists perf_reviews_read          on public.performance_reviews;
drop policy if exists perf_reviews_write         on public.performance_reviews;
drop policy if exists performance_reviews_insert on public.performance_reviews;
drop policy if exists performance_reviews_select on public.performance_reviews;
drop policy if exists performance_reviews_update on public.performance_reviews;

create policy performance_reviews_read on public.performance_reviews
  for select to authenticated
  using (
    reviewee_id = (select auth.uid())
    or reviewer_id = (select auth.uid())
    or (select public.current_user_has_resource_permission('performance_reviews', 'read'))
  );

create policy performance_reviews_insert on public.performance_reviews
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('performance_reviews', 'create')));

-- Reviewees may only edit or submit their own review while it is a draft.
create policy performance_reviews_update on public.performance_reviews
  for update to authenticated
  using (
    reviewer_id = (select auth.uid())
    or (reviewee_id = (select auth.uid()) and status = 'draft')
    or (select public.current_user_has_resource_permission('performance_reviews', 'update'))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  )
  with check (
    reviewer_id = (select auth.uid())
    or (reviewee_id = (select auth.uid()) and status in ('draft', 'submitted'))
    or (select public.current_user_has_resource_permission('performance_reviews', 'update'))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

create policy performance_reviews_delete on public.performance_reviews
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('performance_reviews', 'delete')));

-- hr_review_self_assessments --------------------------------------------------
drop policy if exists hr_review_sa_own_rw on public.hr_review_self_assessments;

create policy hr_review_self_assessments_access on public.hr_review_self_assessments
  for all to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_self_assessments.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  )
  with check (
    user_id = (select auth.uid())
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_self_assessments.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

-- hr_review_peer_nominations --------------------------------------------------
drop policy if exists hr_review_pn_select          on public.hr_review_peer_nominations;
drop policy if exists hr_review_pn_reviewee_insert on public.hr_review_peer_nominations;
drop policy if exists hr_review_pn_update          on public.hr_review_peer_nominations;
drop policy if exists hr_review_pn_delete          on public.hr_review_peer_nominations;

create policy hr_review_peer_nominations_read on public.hr_review_peer_nominations
  for select to authenticated
  using (
    (reviewee_id = (select auth.uid()) and submitted_at is null)
    or nominee_id = (select auth.uid())
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_peer_nominations.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

create policy hr_review_peer_nominations_insert on public.hr_review_peer_nominations
  for insert to authenticated
  with check (
    reviewee_id = (select auth.uid())
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_peer_nominations.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

create policy hr_review_peer_nominations_update on public.hr_review_peer_nominations
  for update to authenticated
  using (
    (nominee_id = (select auth.uid()) and approved = true and submitted_at is null)
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_peer_nominations.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  )
  with check (
    nominee_id = (select auth.uid())
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_peer_nominations.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

create policy hr_review_peer_nominations_delete on public.hr_review_peer_nominations
  for delete to authenticated
  using (
    (reviewee_id = (select auth.uid()) and approved is null and submitted_at is null)
    or exists (select 1 from public.performance_reviews pr
                where pr.id = hr_review_peer_nominations.review_id
                  and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );

-- hr_review_calibration_adjustments -------------------------------------------
drop policy if exists hr_review_cal_admin_all on public.hr_review_calibration_adjustments;

create policy hr_review_calibration_manage on public.hr_review_calibration_adjustments
  for all to authenticated
  using (
    exists (select 1 from public.performance_reviews pr
             where pr.id = hr_review_calibration_adjustments.review_id
               and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  )
  with check (
    exists (select 1 from public.performance_reviews pr
             where pr.id = hr_review_calibration_adjustments.review_id
               and pr.reviewer_id = (select auth.uid()))
    or (select public.current_user_has_resource_permission('performance_reviews', 'approve'))
  );
