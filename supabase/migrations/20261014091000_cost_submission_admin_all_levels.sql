-- Admins can act at every cost submission approval level, as they could before levels existed.
insert into public.permissions (role_id, resource, action)
select r.id, 'cost_submissions', a.action
from public.roles r
cross join (values ('approve_hub'), ('approve_field_ops'), ('approve_country')) a(action)
where r.name = 'admin'
on conflict (role_id, resource, action) do nothing;
