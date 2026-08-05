-- project_comment_reads
-- Persists each user's "last read" position per project so unread comment
-- counts survive clearing browser storage and work across devices/browsers.
-- No FK to projects table to stay compatible with both dev and prod Supabase instances.

create table if not exists public.project_comment_reads (
  project_id   uuid        not null,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_comment_reads enable row level security;

-- Each user can only see and modify their own row
create policy "project_comment_reads: select own"
  on public.project_comment_reads for select
  using (auth.uid() = user_id);

create policy "project_comment_reads: insert own"
  on public.project_comment_reads for insert
  with check (auth.uid() = user_id);

create policy "project_comment_reads: update own"
  on public.project_comment_reads for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for the unread-count query
create index if not exists project_comment_reads_project_user_idx
  on public.project_comment_reads (project_id, user_id);
