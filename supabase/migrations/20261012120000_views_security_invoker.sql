alter view public.dashboard_actions set (security_invoker = true);
alter view public.training_records_v set (security_invoker = true);
alter view public.v_not_covered_recovery_needed set (security_invoker = true);
alter view public.v_target_mmp_pre_allocations set (security_invoker = true);
alter view public.user_accessible_countries set (security_invoker = true);
alter view public.fd_case_summary set (security_invoker = true);
alter view public.fd_form_review_summary set (security_invoker = true);
