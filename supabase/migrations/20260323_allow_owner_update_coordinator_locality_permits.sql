-- Allow permit owners (coordinator/supervisor users) to update their own
-- coordinator_locality_permits rows. This supports upsert conflict updates
-- from the web app when re-uploading locality permits.

alter table public.coordinator_locality_permits enable row level security;

drop policy if exists "coordinator_locality_permits_update_own" on public.coordinator_locality_permits;
create policy "coordinator_locality_permits_update_own"
on public.coordinator_locality_permits
for update
using (auth.uid() = coordinator_id)
with check (auth.uid() = coordinator_id);
