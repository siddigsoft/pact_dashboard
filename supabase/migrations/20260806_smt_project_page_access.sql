-- SMT custom role: project-scoped page access defaults.
-- Custom roles do not inherit PAGE_DEFS `all`; they must be listed explicitly.

INSERT INTO public.page_role_configs (page_slug, roles, updated_at)
VALUES
  ('programme-hub', ARRAY['superAdmin','admin','fom','projectManager','countryDirector','seniorOperationsLead','SMT'], now()),
  ('projects', ARRAY['all','SMT'], now()),
  ('portfolio', ARRAY['superAdmin','admin','fom','countryDirector','projectManager','seniorOperationsLead','SMT'], now()),
  ('dashboard', ARRAY['all','SMT'], now()),
  ('my-tasks', ARRAY['all','SMT'], now()),
  ('notifications', ARRAY['all','SMT'], now()),
  ('calendar', ARRAY['!dataCollector','SMT'], now())
ON CONFLICT (page_slug) DO UPDATE
SET roles = EXCLUDED.roles, updated_at = now();

-- Point assigned SMT users at the role name (not the opaque 'custom' marker)
UPDATE public.profiles
SET role = 'SMT'
WHERE id IN (
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.name = 'SMT'
);
