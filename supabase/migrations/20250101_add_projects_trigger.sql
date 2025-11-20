-- Add updated_at trigger for projects table
-- This ensures the updated_at timestamp is automatically updated when a project is modified

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();
