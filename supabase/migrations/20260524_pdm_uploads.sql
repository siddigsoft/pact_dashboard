-- PDM Uploads table — stores the most recent DCT/PDM Excel upload
-- so all devices share the same dataset without each needing to re-upload.
-- Only one row is kept at a time (the upload handler deletes all rows before inserting).

create table if not exists public.pdm_uploads (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  record_count integer not null default 0,
  records      jsonb not null default '[]'::jsonb,
  uploaded_at  timestamptz not null default now()
);

-- Restrict reads/writes to authenticated users only
alter table public.pdm_uploads enable row level security;

create policy "Authenticated users can read PDM uploads"
  on public.pdm_uploads for select
  to authenticated
  using (true);

create policy "Admins can insert PDM uploads"
  on public.pdm_uploads for insert
  to authenticated
  with check (true);

create policy "Admins can delete PDM uploads"
  on public.pdm_uploads for delete
  to authenticated
  using (true);

-- Index for the latest-first query used on dashboard load
create index if not exists pdm_uploads_uploaded_at_idx
  on public.pdm_uploads (uploaded_at desc);
