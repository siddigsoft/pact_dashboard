-- Adds: per-output proof files, owner-confirmation of primary's actual hours.
-- Per-co-assignee actual_hours + per-co-assignee confirmation are stored
-- inline in the existing personal_tasks.co_assignees jsonb array (no schema
-- change needed for them — the update_task_co_assignees RPC already accepts
-- arbitrary jsonb shape).

alter table public.personal_tasks
  add column if not exists output_files jsonb not null default '[]'::jsonb,
  add column if not exists actual_hours_confirmed_at timestamptz,
  add column if not exists actual_hours_confirmed_by uuid;

-- output_files shape: [{ name: string, url: string, uploadedAt: iso, uploadedBy: uuid }]
comment on column public.personal_tasks.output_files is
  'Proof files attached to the task Output / Accomplishments. Array of {name,url,uploadedAt,uploadedBy}.';

comment on column public.personal_tasks.actual_hours_confirmed_at is
  'When the task owner confirmed the primary assignee''s reported actual_hours. Per-co-assignee confirmation is stored inside co_assignees[].actual_hours_confirmed_at.';

comment on column public.personal_tasks.actual_hours_confirmed_by is
  'User who confirmed the primary assignee''s reported actual_hours.';
