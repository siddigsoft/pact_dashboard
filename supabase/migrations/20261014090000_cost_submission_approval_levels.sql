-- Cost submission approval levels become grantable permissions.
-- A submission climbs the levels above its submitter's level:
--   coordinator / data collector: approve_hub -> approve_field_ops -> approve_country -> approve_final
--   supervisor:                   approve_field_ops -> approve_country -> approve_final
--   FOM:                          approve_country -> approve_final
--   country director:             approve_final
-- Grants below reproduce today's hardcoded approvers and submitters.

alter table public.permissions drop constraint if exists permissions_action_check;
alter table public.permissions add constraint permissions_action_check check (
  action = any (array[
    'create', 'read', 'update', 'delete', 'approve', 'assign', 'archive', 'restore',
    'override', 'export', 'submit', 'full_report', 'state_report', 'hub_report',
    'mark_paid', 'use_for_payment', 'assign_cost', 'settings',
    'approve_hub', 'approve_field_ops', 'approve_country', 'approve_final'
  ]::text[])
);

insert into public.permissions (role_id, resource, action)
select r.id, 'cost_submissions', g.action
from (values
  ('supervisor',      'approve_hub'),
  ('fom',             'approve_field_ops'),
  ('countryDirector', 'approve_country'),
  ('admin',           'approve_final'),
  ('fom',             'submit'),
  ('coordinator',     'submit'),
  ('supervisor',      'submit'),
  ('dataCollector',   'submit'),
  ('ict',             'submit')
) g(role_name, action)
join public.roles r on r.name = g.role_name
on conflict (role_id, resource, action) do nothing;
