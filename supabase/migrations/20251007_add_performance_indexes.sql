-- Performance indexes for common queries in TPM Workflow
-- Safe to run multiple times

-- Project activities
create index if not exists idx_project_activities_project_id on public.project_activities(project_id);
create index if not exists idx_project_activities_assigned_to on public.project_activities(assigned_to);

-- Sub activities
create index if not exists idx_sub_activities_activity_id on public.sub_activities(activity_id);
create index if not exists idx_sub_activities_assigned_to on public.sub_activities(assigned_to);
create index if not exists idx_sub_activities_due_date on public.sub_activities(due_date);

-- MMP files
create index if not exists idx_mmp_files_created_at on public.mmp_files(created_at);
create index if not exists idx_mmp_files_status on public.mmp_files(status);
create index if not exists idx_mmp_files_project_id on public.mmp_files(project_id);

-- Site visits
create index if not exists idx_site_visits_due_date on public.site_visits(due_date);
create index if not exists idx_site_visits_assigned_to on public.site_visits(assigned_to);
create index if not exists idx_site_visits_mmp_id on public.site_visits(mmp_id);
create index if not exists idx_site_visits_state on public.site_visits(state);
create index if not exists idx_site_visits_site_code on public.site_visits(site_code);
